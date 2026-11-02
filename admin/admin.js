/* =====================================================================
   PAINEL LUME WOMAN — login e verificação de permissão
   - Entra com e-mail e senha (Supabase Auth).
   - Confirma que a pessoa está na tabela admin_users.
   - Mostra o painel somente depois dessa confirmação.
   IMPORTANTE: esta verificação serve para a TELA. A proteção de verdade
   dos dados é feita pelo banco (RLS), que continua valendo mesmo que
   alguém tente burlar esta página.
   ===================================================================== */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const views = { boot: $('view-boot'), login: $('view-login'), panel: $('view-panel') };
  const SCREENS = { '': 'inicio', '#produtos': 'produtos', '#vendas': 'vendas', '#estoque': 'estoque', '#fotografias': 'fotografias', '#personalizar': 'personalizar', '#entregas':'entregas' };

  let client = null;

  // Ponto de encontro com outros módulos do painel (ex.: produtos.js).
  const Panel = window.LumePanel = window.LumePanel || { client: null, routeHandlers: [], clearHandlers: [] };

  /* ---------- Mostrar uma tela por vez ---------- */
  function show(name) {
    Object.keys(views).forEach(k => { views[k].hidden = (k !== name); });
  }

  function setMessage(text, kind) {
    const el = $('login-message');
    el.textContent = text || '';
    el.className = 'message' + (kind === 'info' ? ' info' : '');
  }

  function showLogin(text, kind) {
    // Limpa tudo que pertence ao painel (inclusive dados dos módulos, como a lista de produtos)
    Panel.clearHandlers.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
    $('user-email').textContent = '';
    $('greeting').textContent = 'Olá!';
    $('password').value = '';
    setMessage(text, kind);
    setBusy(false);
    show('login');
  }

  function setBusy(busy) {
    const btn = $('login-submit');
    btn.disabled = busy;
    btn.firstChild.textContent = busy ? 'Entrando… ' : 'Entrar ';
  }

  /* ---------- Conferir a configuração ---------- */
  function jwtRole(token) {
    try {
      const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(part)).role || null;
    } catch (_) { return null; }
  }

  function readConfig() {
    const cfg = window.LUME_SUPABASE || {};
    const url = String(cfg.url || '').trim().replace(/\/+$/, '');
    const key = String(cfg.publishableKey || '').trim();

    if (!url || !key || url.startsWith('COLE_AQUI') || key.startsWith('COLE_AQUI')) {
      return { ok: false, msg: 'Falta configurar o painel: abra o arquivo supabase-config.js e cole a Project URL e a Publishable key.' };
    }
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
      return { ok: false, msg: 'A Project URL parece incorreta. Ela deve começar com https:// e terminar com .supabase.co.' };
    }
    if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
      return { ok: false, msg: 'ATENÇÃO: você colou uma chave SECRETA. Apague-a agora do arquivo supabase-config.js e use apenas a Publishable key.' };
    }
    if (!(key.startsWith('sb_publishable_') || jwtRole(key) === 'anon')) {
      return { ok: false, msg: 'A chave informada não parece ser a Publishable key (ela começa com sb_publishable_).' };
    }
    return { ok: true, url, key };
  }

  /* ---------- Verificar se é administradora ---------- */
  async function checkAdmin(user) {
    try {
      const { data, error } = await client
        .from('admin_users')
        .select('user_id, nome')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) return { status: 'error' };
      if (!data) return { status: 'denied' };
      return { status: 'ok', nome: data.nome };
    } catch (e) {
      console.error('Falha ao consultar permissão administrativa', e);
      return { status: 'error' };
    }
  }

  async function enterPanel(user) {
    const result = await checkAdmin(user);

    if (result.status === 'denied') {
      await client.auth.signOut({ scope: 'local' });
      showLogin('Esta conta não tem permissão para acessar o painel.');
      return;
    }
    if (result.status === 'error') {
      await client.auth.signOut({ scope: 'local' });
      showLogin('Não foi possível confirmar sua permissão agora. Verifique a internet e tente de novo.');
      return;
    }

    $('user-email').textContent = user.email || '';
    $('greeting').textContent = result.nome ? `Olá, ${result.nome}!` : 'Olá!';
    $('password').value = '';
    setMessage('');
    show('panel');
    route();
  }

  /* ---------- Navegação interna do painel ---------- */
  function route() {
    if (views.panel.hidden) return;
    const base = location.hash.split('/')[0];   // '#produtos/novo' -> '#produtos'
    const current = SCREENS[base] || 'inicio';
    document.querySelectorAll('[data-screen]').forEach(s => { s.hidden = (s.dataset.screen !== current); });
    document.querySelectorAll('[data-nav]').forEach(a => {
      const on = a.dataset.nav === current;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    Panel.routeHandlers.forEach(fn => { try { fn(location.hash); } catch (e) { console.error(e); } });
  }

  /* ---------- Entrar ---------- */
  async function onSubmit(e) {
    e.preventDefault();
    const email = $('email').value.trim();
    const password = $('password').value;

    if (!email || !password) {
      setMessage('Preencha o e-mail e a senha.');
      return;
    }
    setMessage('');
    setBusy(true);

    let result;
    try {
      result = await client.auth.signInWithPassword({ email, password });
    } catch (_) {
      showLogin('Sem conexão com o servidor. Verifique a internet e tente de novo.');
      return;
    }

    $('password').value = '';
    const { data, error } = result;

    if (error || !data || !data.user) {
      const text =
        error && error.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' :
        error && /fetch|network/i.test(error.name + ' ' + error.message) ? 'Sem conexão com o servidor. Verifique a internet e tente de novo.' :
        'E-mail ou senha incorretos.';
      setMessage(text);
      setBusy(false);
      return;
    }
    await enterPanel(data.user);
  }

  /* ---------- Sair ---------- */
  async function onLogout() {
    const btn = $('logout');
    if (btn.disabled) return;
    btn.disabled = true;
    $('panel-alert').hidden = true;
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      showLogin('Você saiu da conta.', 'info');
    } catch (e) {
      console.error('Falha ao encerrar sessão', e);
      $('panel-alert').textContent = 'Não foi possível confirmar a saída. Verifique sua conexão e tente novamente.';
      $('panel-alert').hidden = false;
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- Mostrar/ocultar a senha ---------- */
  function onTogglePassword() {
    const input = $('password');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    $('toggle-password').textContent = showing ? 'Mostrar' : 'Ocultar';
    $('toggle-password').setAttribute('aria-pressed', String(!showing));
  }

  /* ---------- Início ---------- */
  async function start() {
    const cfg = readConfig();
    if (!cfg.ok) { showLogin(cfg.msg); $('login-submit').disabled = true; return; }
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      showLogin('Não foi possível carregar a biblioteca do Supabase. Verifique a internet e recarregue a página.');
      $('login-submit').disabled = true;
      return;
    }

    client = window.supabase.createClient(cfg.url, cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });

    Panel.client = client;

    // Se a sessão acabar (ou for encerrada em outra aba), volta para o login.
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT' && !views.panel.hidden) {
        showLogin('Sua sessão foi encerrada. Entre novamente.');
      }
    });

    $('login-form').addEventListener('submit', onSubmit);
    $('logout').addEventListener('click', onLogout);
    $('toggle-password').addEventListener('click', onTogglePassword);
    window.addEventListener('hashchange', route);

    // Já existe uma sessão salva neste aparelho?
    let session = null;
    try { session = (await client.auth.getSession()).data.session; } catch (_) { /* segue para o login */ }
    if (!session) { showLogin(); return; }

    // Confirma no servidor que a sessão ainda vale (não confia só no que está salvo no aparelho).
    let user = null;
    try { user = (await client.auth.getUser()).data.user; } catch (_) { /* segue */ }
    if (!user) {
      try { await client.auth.signOut({ scope: 'local' }); } catch (_) { /* ignora */ }
      showLogin();
      return;
    }
    await enterPanel(user);
  }

  start();
})();
