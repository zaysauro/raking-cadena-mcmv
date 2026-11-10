/**
 * Presença (QR do Amparo) para a TV do ranking — ponte servidor a servidor.
 * A chave da TV (AMPARO_DISPLAY_KEY, "amd_…", criada em Amparo › Presença e roleta › Telas de TV)
 * fica só aqui no servidor. O navegador da TV recebe apenas o QR em SVG, o horário da próxima troca
 * e nome/situação da equipe do dia. O token do QR e o link de check-in não são repassados em texto.
 * Contrato: GET {AMPARO_URL}/api/attendance/display?current=<display_id> (docs/PRESENCA-ROLETAS.md no Amparo).
 */
const DEFAULT_AMPARO_URL = 'https://amparo-crm-livid.vercel.app';
const TIMEOUT_MS = 8000;
const DISPLAY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['present', 'paused', 'checked_out', 'absent']);

const count = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);
const isoOrNull = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);

function pick(d) {
  const counts = d.counts || {};
  const svg = typeof d.qr_svg === 'string' ? d.qr_svg.trim() : '';
  return {
    ok: true,
    configured: d.configured !== false,
    rotate: d.rotate === true,
    display_id: typeof d.display_id === 'string' && DISPLAY_ID.test(d.display_id) ? d.display_id : null,
    starts_at: isoOrNull(d.starts_at),
    expires_at: isoOrNull(d.expires_at),
    // Troca de turno: ninguém leu o QR do turno atual ainda (Amparo zera a presença a cada troca).
    turn_reset: d.turn_reset === true,
    turn_start: isoOrNull(d.turn_start),
    // SVG gerado pelo próprio Amparo (biblioteca qrcode); sem <script>, a TV o exibe como imagem.
    qr_svg: svg.startsWith('<svg') && !/<script|on\w+=/i.test(svg) ? svg : null,
    counts: { present: count(counts.present), paused: count(counts.paused), checked_out: count(counts.checked_out), absent: count(counts.absent) },
    team: (Array.isArray(d.team) ? d.team : []).slice(0, 60).map((p) => ({
      name: String((p && p.name) || '').slice(0, 80),
      status: STATUSES.has(p && p.status) ? p.status : 'absent',
      checked_in_at: isoOrNull(p && p.checked_in_at),
    })),
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, code: 'method_not_allowed' });
  const key = String(process.env.AMPARO_DISPLAY_KEY || '').trim();
  if (!key.startsWith('amd_')) return res.status(503).json({ ok: false, code: 'not_configured' });

  const base = String(process.env.AMPARO_URL || DEFAULT_AMPARO_URL).replace(/\/+$/, '');
  const url = new URL('/api/attendance/display', base);
  const current = String((req.query && req.query.current) || '');
  if (DISPLAY_ID.test(current)) url.searchParams.set('current', current);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (response.status === 401) return res.status(502).json({ ok: false, code: 'invalid_key' });
    if (!response.ok || !data || data.ok === false) return res.status(502).json({ ok: false, code: 'upstream_error' });
    return res.status(200).json(pick(data));
  } catch (error) {
    return res.status(504).json({ ok: false, code: error && error.name === 'AbortError' ? 'timeout' : 'upstream_error' });
  } finally {
    clearTimeout(timer);
  }
};
