/* Postgres isolado em WASM; não conecta ao projeto remoto. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {PGlite} = require('@electric-sql/pglite');

test('RLS: leitura pública, escrita só por admin e validação das condições', async () => {
  const db = await PGlite.create();
  try {
    // Reproduz as dependências inspecionadas no Supabase, sem dados de clientes.
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create schema private;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table public.admin_users (user_id uuid primary key);
      insert into public.admin_users values ('00000000-0000-0000-0000-000000000001');
      alter table public.admin_users enable row level security;
      grant select on public.admin_users to authenticated;
      create policy self_read on public.admin_users for select to authenticated using (user_id = (select auth.uid()));
      create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
        select exists (select 1 from public.admin_users where user_id = (select auth.uid()))
      $$;
      grant usage on schema private, auth to authenticated;
    `);
    const migrations = path.join(__dirname, '../supabase/migrations');
    for (const migration of fs.readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(migrations, migration), 'utf8'));
    }
    const query = sql => db.query(sql);
    const rows = async sql => (await query(sql)).rows;
    const defaults = (await rows('select * from public.loja_pagamentos'))[0];
    const context = {window: {}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pagamentos.js'), 'utf8'), context);
    const config = context.window.LumePagamentoConfig;
    assert.deepEqual(JSON.parse(JSON.stringify(config.validate(defaults))), JSON.parse(JSON.stringify(config.defaults)));

    await db.exec('set role anon');
    assert.equal((await rows('select * from public.loja_pagamentos')).length, 1);
    await assert.rejects(query('update public.loja_pagamentos set credito_parcelas = 6'), /permission denied/);
    await assert.rejects(query('update public.loja_pagamentos set pix_ativo = false'), /permission denied/);
    await assert.rejects(query('insert into public.loja_pagamentos (id) values (1)'), /permission denied/);
    await assert.rejects(query('delete from public.loja_pagamentos'), /permission denied/);

    await db.exec("reset role; set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false)");
    assert.equal((await rows('select * from public.loja_pagamentos')).length, 1);
    assert.equal((await query('update public.loja_pagamentos set credito_parcelas = 6 returning id')).affectedRows, 0);
    assert.equal((await rows('update public.loja_pagamentos set pix_ativo = false, credito_ativo = false, debito_ativo = false returning id')).length, 0);
    assert.equal((await rows('select credito_parcelas from public.loja_pagamentos'))[0].credito_parcelas, 3);
    // user_metadata não pode promover uma cliente a administradora.
    await db.exec(`select set_config('request.jwt.claims', '{"user_metadata":{"admin":true}}', false)`);
    assert.equal((await rows('select private.is_admin() as allowed'))[0].allowed, false);

    await db.exec("select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false)");
    const saved = await rows("update public.loja_pagamentos set credito_parcelas = 6, credito_sem_juros = false, pix_texto = 'Desconto a combinar', credito_texto = 'Taxa a confirmar', debito_texto = 'À vista', aviso_geral = 'Confirme o total com a equipe.' where id = 1 returning *");
    assert.equal(saved.length, 1);
    assert.equal(saved[0].credito_parcelas, 6);
    const visibility = await rows('update public.loja_pagamentos set pix_ativo = true, credito_ativo = false, debito_ativo = false where id = 1 returning *');
    assert.equal(visibility[0].pix_ativo, true);
    assert.equal(visibility[0].credito_ativo, false);
    assert.equal(visibility[0].debito_ativo, false);
    await assert.rejects(query('update public.loja_pagamentos set pix_ativo = null'), /not-null constraint/);
    assert.equal((await rows('update public.loja_pagamentos set pix_ativo = false returning id')).length, 1);
    await assert.rejects(query('update public.loja_pagamentos set credito_parcelas = 0'), /check constraint/);
    await assert.rejects(query('update public.loja_pagamentos set credito_parcelas = 13'), /check constraint/);
    await assert.rejects(query("update public.loja_pagamentos set pix_texto = repeat('a', 241)"), /check constraint/);
    await assert.rejects(query("update public.loja_pagamentos set aviso_geral = '   '"), /check constraint/);
    await assert.rejects(query('update public.loja_pagamentos set id = 2'), /permission denied/);
    await assert.rejects(query('delete from public.loja_pagamentos'), /permission denied/);
    await assert.rejects(query('insert into public.loja_pagamentos (id) values (1)'), /permission denied/);

    // A leitura pública recebe a edição e a revogação do papel de admin é imediata.
    await db.exec('reset role; set role anon');
    assert.equal((await rows('select credito_parcelas from public.loja_pagamentos'))[0].credito_parcelas, 6);
    assert.equal((await rows('select pix_ativo, credito_ativo, debito_ativo from public.loja_pagamentos'))[0].pix_ativo, false);
    await db.exec("reset role; delete from public.admin_users; set role authenticated");
    assert.equal((await rows('select private.is_admin() as allowed'))[0].allowed, false);
    assert.equal((await rows('update public.loja_pagamentos set credito_parcelas = 3 returning id')).length, 0);
    await db.exec("select set_config('request.jwt.claim.sub', '', false)");
    assert.equal((await rows('select private.is_admin() as allowed'))[0].allowed, false);
  } finally { await db.close(); }
});
