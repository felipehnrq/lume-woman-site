const {test,expect}=require('@playwright/test');

test('AURA: primeira pintura usa cores aprovadas sem cache',async({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const theme=await page.locator('html').evaluate(el=>({
    clay:el.style.getPropertyValue('--clay'),
    paper:el.style.getPropertyValue('--paper'),
    ink:el.style.getPropertyValue('--ink')
  }));
  expect(theme).toEqual({clay:'#543d34',paper:'#f7e7da',ink:'#29221f'});
  await expect(page.locator('#tema-banner')).toHaveAttribute('src',/branding.*banner.*webp/);
});

test('AURA: imagem única antecede o texto no celular',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const art=page.locator('.hero-art'),copy=page.locator('.hero-copy');
  await expect(art).toHaveCSS('order','1');
  await expect(copy).toHaveCSS('order','2');
  expect(await page.locator('.hero-art img').count()).toBe(1);
  const width=await page.evaluate(()=>document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});
