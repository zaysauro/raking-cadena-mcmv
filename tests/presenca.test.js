const assert = require('node:assert/strict');
const handler = require('../api/presenca.js');

const ID = '3f0c1a2b-4d5e-4f60-8a71-92b3c4d5e6f7';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 37 37" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h37v37H0z"/></svg>\n';
const call = async (query = {}) => {
  let status, value;
  await handler({ method: 'GET', query }, { setHeader() {}, status(s) { status = s; return this; }, json(v) { value = v; return v; } });
  return { status, value };
};
let seen;
const upstream = (status, body) => { global.fetch = async (url, init) => { seen = { url: String(url), init }; return { status, ok: status < 400, json: async () => body }; }; };

(async () => {
  delete process.env.AMPARO_DISPLAY_KEY;
  assert.deepEqual(await call(), { status: 503, value: { ok: false, code: 'not_configured' } }, 'sem chave o painel fica oculto');

  process.env.AMPARO_DISPLAY_KEY = 'amd_' + 'k'.repeat(43);
  process.env.AMPARO_URL = 'https://amparo.example/';
  upstream(200, {
    ok: true, configured: true, rotate: true, token: 'segredo-do-periodo', checkin_url: 'https://amparo.example/presenca?token=segredo-do-periodo',
    qr_svg: SVG, display_id: ID, starts_at: '2026-11-09T11:30:00Z', expires_at: '2026-11-09T20:30:00Z',
    counts: { present: 1, paused: 0, checked_out: 0, absent: 4 },
    team: [{ name: 'Jhonattan Paes', status: 'present', checked_in_at: '2026-11-09T11:40:00Z', email: 'x@y' }],
  });
  const ok = await call({ current: ID });
  assert.equal(ok.status, 200);
  assert.equal(seen.url, 'https://amparo.example/api/attendance/display?current=' + ID);
  assert.equal(seen.init.headers.Authorization, 'Bearer ' + process.env.AMPARO_DISPLAY_KEY, 'chave só no servidor');
  assert.equal(ok.value.qr_svg, SVG.trim());
  assert.equal(ok.value.expires_at, '2026-11-09T20:30:00Z');
  assert.ok(!('token' in ok.value) && !('checkin_url' in ok.value), 'token não vai para o navegador');
  assert.deepEqual(Object.keys(ok.value.team[0]).sort(), ['checked_in_at', 'name', 'status'], 'só nome, situação e entrada');
  assert.ok(!JSON.stringify(ok.value).includes('segredo'), 'nenhum vestígio do token');

  await call({ current: 'nao-e-uuid' });
  assert.equal(seen.url, 'https://amparo.example/api/attendance/display', 'current inválido não é repassado');

  upstream(200, { ok: true, configured: true, rotate: true, qr_svg: '<svg onload="alert(1)"></svg>', display_id: ID });
  assert.equal((await call()).value.qr_svg, null, 'SVG suspeito é descartado');

  upstream(401, { ok: false, code: 'invalid_key' });
  assert.deepEqual(await call(), { status: 502, value: { ok: false, code: 'invalid_key' } });
  upstream(500, { ok: false, code: 'server_error' });
  assert.equal((await call()).value.code, 'upstream_error');
  global.fetch = async () => { const e = new Error('abort'); e.name = 'AbortError'; throw e; };
  assert.deepEqual(await call(), { status: 504, value: { ok: false, code: 'timeout' } });

  console.log('presenca.test.js: ok');
})().catch((e) => { console.error(e); process.exit(1); });

// Roda depois dos cenários acima (mesmo global.fetch).
setTimeout(async () => {
  process.env.AMPARO_DISPLAY_KEY = 'amd_' + 'x'.repeat(43);
  upstream(200, { ok: true, configured: true, rotate: false, team: [], counts: { present: 0 }, turn_reset: true, turn_start: '2026-11-10T11:30:00.000Z' });
  const r = await call();
  assert.equal(r.status, 200); assert.equal(r.value.turn_reset, true); assert.equal(r.value.turn_start, '2026-11-10T11:30:00.000Z');
  console.log('ok - turn_reset repassado');
}, 300);
