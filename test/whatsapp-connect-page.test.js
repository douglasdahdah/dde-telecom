'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../public/admin/conectar-whatsapp.js'), 'utf8');
async function page({ token = 'session-only', perfil = 'admin', http = 200 } = {}) {
  const elements = {}, listeners = {}, requests = [], scripts = [], timers = [];
  const element = id => elements[id] ||= { hidden: true, disabled: true, value: '', textContent: '', addEventListener: (event, callback) => { listeners[id + ':' + event] = callback; } };
  const location = { replace(url) { location.redirect = url; } };
  const window = { addEventListener: (event, callback) => { listeners[event] = callback; } };
  vm.runInNewContext(source, {
    document: { getElementById: element, createElement: () => ({}), head: { appendChild: script => scripts.push(script) } },
    window, location, localStorage: { getItem: () => token },
    fetch: async (url, options) => { requests.push({ url, options }); return { status: http, ok: http === 200, json: async () => ({ usuario: { perfil } }) }; },
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {}
  });
  await new Promise(resolve => setImmediate(resolve));
  return { elements, listeners, requests, scripts, timers, location, window };
}
test('conexão exige sessão admin e não transmite JWT ao SDK da Meta', async () => {
  const absent = await page({ token: '' });
  assert.equal(absent.location.redirect, '/admin/login.html'); assert.equal(absent.scripts.length, 0);
  const vendor = await page({ perfil: 'vendedor' }); assert.equal(vendor.scripts.length, 0);
  const expired = await page({ http: 401 }); assert.equal(expired.location.redirect, '/admin/login.html'); assert.equal(expired.scripts.length, 0);
  const admin = await page(); assert.equal(admin.scripts[0].src, 'https://connect.facebook.net/pt_BR/sdk.js');
  assert.equal(admin.requests.length, 1); assert.equal(admin.requests[0].url, '/api/auth/me');
  assert.equal(admin.requests[0].options.headers.Authorization, 'Bearer session-only');
});
test('autorização temporária não é declarada como entrega e é apagada ao sair ou expirar', async () => {
  const p = await page(); let callback, options;
  p.window.FB = { init() {}, login(cb, opts) { callback = cb; options = opts; } };
  p.window.fbAsyncInit(); p.listeners['conectar:click']();
  assert.equal(p.elements.conectar.disabled, true);
  assert.equal(options.extras.featureType, 'whatsapp_business_app_onboarding');
  callback({ authResponse: { code: 'temporary-test-code' } });
  assert.equal(p.elements.codigo.value, 'temporary-test-code');
  assert.match(p.elements.status.textContent, /Falta validar/);
  p.timers[0](); assert.equal(p.elements.codigo.value, ''); assert.equal(p.elements.resultado.hidden, true);
  p.listeners['conectar:click'](); callback({ authResponse: { code: 'second-test-code' } });
  p.listeners.pagehide(); assert.equal(p.elements.codigo.value, '');
});
test('mensagens de outra origem e cancelamento não produzem autorização falsa', async () => {
  const p = await page(); let callback;
  p.window.FB = { init() {}, login(cb) { callback = cb; } }; p.window.fbAsyncInit(); p.listeners['conectar:click']();
  p.listeners.message({ origin: 'https://evil.invalid', data: { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data: { waba_id: '99' } } });
  assert.equal(p.elements.ativos.textContent, '');
  callback({}); assert.equal(p.elements.codigo.value, ''); assert.match(p.elements.status.textContent, /Nenhum remetente/);
});
