# Ranking MCMV TV — Cadena

Tela de ranking MCMV (Vercel). Configure `MONDAY_API_TOKEN` em Vercel > Project Settings > Environment Variables.

- `index.html`: tela da TV (pódio, OKRs semanais e totais).
- `api/ranking.js`: ranking do mês a partir do quadro central de leads (vendas, propostas) e dos quadros Pastas e Agendamentos. Ordem: vendas > propostas > pastas > agendamentos. Aceita `?month=AAAA-MM`. Mantém o último snapshot completo em cache e sinaliza dados parciais (`complete`, `stale`, `warnings`).
- `api/operations.js`: OKRs semanais (usado só pela segunda tela).
- `api/appointments.js`: contagem de agendamentos por funil (legado).
- `tests/ranking.test.js`: `node tests/ranking.test.js`.
