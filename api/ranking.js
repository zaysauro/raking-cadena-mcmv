/**
 * Ranking MCMV — backend resiliente (Vercel Node.js)
 * Regras: vendas > propostas > pastas > agendamentos.
 * Fonte: leads central, pastas e agendamentos; sem depender de funis individuais.
 * Segurança: nunca devolve token nem detalhes sensíveis ao cliente.
 */
const BOARDS = { leads: 18428438591, pastas: 18431520161, agendamentos: 18431548138 };
const COL = {
  leadOwner: 'color_mm5h9nnn', soldAt: 'date_mm57xz4a', proposedAt: 'date_mm57ge7a',
  leadStage: 'color_mm57z6j4', leadEntered: 'date_mm57ep37',
  pastaOwner: 'status', pastaDate: 'date4',
  appointmentOwner: 'single_selecthvi7b44', appointmentDate: 'date4', appointmentStage: 'single_selects5s08f2'
};
const timeoutMs = 19000;
const TTL_MS = 60_000;
let snapshot = null;
let inflight = null;
const normalized = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = new Map([['marcelo', 'marcelosilva'], ['cleyson', 'cleysonmendonca'], ['kauanpereira', 'pedrokauan'], ['pedrokauan', 'pedrokauan']]);
function canonical(value) { const n = normalized(value); return aliases.get(n) || n; }
function dateValue(value) {
  if (!value) return '';
  const m = String(value).match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}
function ym(date) { return dateValue(date).slice(0, 7); }
function parseMonth(raw) {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw || '')) return raw;
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 7);
}
function val(row, id) { return row.column_values?.find((c) => c.id === id)?.text || ''; }
function date(row, id) { const c = row.column_values?.find((c) => c.id === id); return dateValue(c?.text || c?.value || ''); }
async function gql(query, variables) {
  if (!process.env.MONDAY_API_TOKEN) throw new Error('MONDAY_API_TOKEN não configurado');
  const r = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: { Authorization: process.env.MONDAY_API_TOKEN, 'Content-Type': 'application/json', 'API-Version': '2025-10' },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(timeoutMs)
  });
  if (!r.ok) throw new Error(`Monday HTTP ${r.status}`);
  const response = await r.json();
  if (response.errors?.length) throw new Error(`Monday GraphQL: ${response.errors[0].message}`);
  return response.data;
}
async function boardPage(boardId, cursor) {
  const fields = 'cursor items { id name column_values { id text value } }';
  const query = cursor
    ? `query($cursor:String!){next_items_page(cursor:$cursor,limit:500){${fields}}}`
    : `query($id:ID!){boards(ids:[$id]){items_page(limit:500){${fields}}}}`;
  const data = await gql(query, cursor ? { cursor } : { id: String(boardId) });
  const page = cursor ? data?.next_items_page : data?.boards?.[0]?.items_page;
  if (!page) throw new Error(`Quadro inacessível: ${boardId}`);
  return page;
}
async function allItems(id) {
  const rows = [];
  let cursor = null;
  do {
    const page = await boardPage(id, cursor);
    rows.push(...page.items);
    cursor = page.cursor;
    if (rows.length > 15000) throw new Error(`Limite de segurança atingido no quadro ${id}`);
  } while (cursor);
  return rows;
}
async function activePeople() {
  const data = await gql('query($id:ID!){boards(ids:[$id]){columns{id title type settings_str}}}', { id: String(BOARDS.leads) });
  const board = data?.boards?.[0];
  if (!board) throw new Error('Não foi possível consultar os responsáveis do quadro principal');
  const column = board.columns.find((x) => x.id === COL.leadOwner);
  if (!column) throw new Error('Coluna de responsáveis indisponível');
  const settings = JSON.parse(column.settings_str || '{}');
  const rawLabels = settings.labels;
  const labels = Array.isArray(rawLabels) ? rawLabels : Object.values(rawLabels || {});
  // Monday pode não informar is_deactivated em todas as versões; nesse caso
  // um status vazio não é considerado funcionário e as demais entradas permanecem.
  const people = labels.filter((x) => typeof x === 'object' ? x.label && !x.is_deactivated : !!x)
    .map((x) => typeof x === 'object' ? x.label : x).filter(Boolean);
  if (!people.length) throw new Error('Nenhum responsável ativo identificado; não publicar ranking vazio');
  return [...new Map(people.map((name) => [canonical(name), name])).values()];
}
function tally(rows, field, dateField, month, out, property, predicate = () => true) {
  for (const row of rows) {
    if (ym(date(row, dateField)) !== month || !predicate(row)) continue;
    const key = canonical(val(row, field));
    if (out.has(key)) out.get(key)[property]++;
  }
}
async function calculate(month) {
  const warnings = [];
  // Falha do quadro principal impede substituir um snapshot confiável.
  const [people, leads] = await Promise.all([activePeople(), allItems(BOARDS.leads)]);
  const result = new Map(people.map((name) => [canonical(name), { name, vendas: 0, propostas: 0, pastas: 0, agendamentos: 0 }]));
  tally(leads, COL.leadOwner, COL.soldAt, month, result, 'vendas');
  tally(leads, COL.leadOwner, COL.proposedAt, month, result, 'propostas');
  const optional = await Promise.allSettled([allItems(BOARDS.pastas), allItems(BOARDS.agendamentos)]);
  const complete = optional.every((x) => x.status === 'fulfilled');
  if (optional[0].status === 'fulfilled') tally(optional[0].value, COL.pastaOwner, COL.pastaDate, month, result, 'pastas');
  else warnings.push('Quadro Pastas indisponível; esse indicador está incompleto.');
  if (optional[1].status === 'fulfilled') {
    tally(optional[1].value, COL.appointmentOwner, COL.appointmentDate, month, result, 'agendamentos',
      (row) => /agendamento/i.test(val(row, COL.appointmentStage)));
  } else warnings.push('Quadro Agendamentos indisponível; esse indicador está incompleto.');
  const ranking = [...result.values()].sort((a, b) =>
    b.vendas - a.vendas || b.propostas - a.propostas || b.pastas - a.pastas || b.agendamentos - a.agendamentos || a.name.localeCompare(b.name, 'pt-BR'))
    .map((person, i) => ({ ...person, posicao: i + 1 }));
  return { month, ranking, updatedAt: new Date().toISOString(), complete, warnings,
    sourceBoards: BOARDS };
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
  const month = parseMonth(String(req.query?.month || ''));
  const key = month;
  if (snapshot?.month === key && Date.now() - snapshot.savedAt < TTL_MS) return res.status(200).json(snapshot.data);
  try {
    if (!inflight || inflight.month !== month) inflight = { month, work: calculate(month) };
    const next = await inflight.work;
    // Nunca substitua um snapshot completo por uma classificação parcial.
    if (next.complete) snapshot = { month: key, data: next, savedAt: Date.now() };
    if (!next.complete && snapshot?.month === key) return res.status(200).json({ ...snapshot.data, stale: true, warnings: next.warnings });
    return res.status(200).json(next);
  } catch (error) {
    console.error('[ranking-mcmv]', error.message);
    if (snapshot?.month === key) return res.status(200).json({ ...snapshot.data, stale: true, warnings: ['Dados em cache: Monday temporariamente indisponível'] });
    return res.status(503).json({ error: 'Dados MCMV temporariamente indisponíveis', retryable: true });
  } finally {
    if (inflight?.month === month) inflight = null;
  }
};
