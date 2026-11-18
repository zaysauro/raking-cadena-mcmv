# Ranking MCMV TV — Amparo Imobiliária

Tela de ranking MCMV (Vercel). Configure `MONDAY_API_TOKEN` em Vercel > Project Settings > Environment Variables.

- `index.html`: tela da TV (pódio, OKRs semanais e totais).
- `api/ranking.js`: ranking do mês a partir do quadro central de leads (vendas, propostas) e dos quadros Pastas e Agendamentos. Ordem: vendas > propostas > pastas > agendamentos. Aceita `?month=AAAA-MM`. Mantém o último snapshot completo em cache e sinaliza dados parciais (`complete`, `stale`, `warnings`).
- `api/operations.js`: OKRs semanais (usado só pela segunda tela).
- `api/appointments.js`: contagem de agendamentos por funil (legado).
- `tests/ranking.test.js`: `node tests/ranking.test.js`.

## Presença (QR do Amparo)

- `api/presenca.js`: ponte servidor a servidor para `GET {AMPARO_URL}/api/attendance/display`. A chave da TV fica só no servidor; o navegador recebe o QR em SVG, o horário da próxima troca e nome/situação da equipe do dia.
- `presence.js`: painel lateral fixo com o QR e quem está na roleta hoje. Confere a cada 30 s; o código muda automaticamente às 08:30 e às 17:30 (definido no Amparo).
- Variáveis (Production): `AMPARO_DISPLAY_KEY` (privada, `amd_…`, criada em Amparo › Presença e roleta › Telas de TV) e, opcional, `AMPARO_URL` (padrão `https://amparo-crm-livid.vercel.app`). Sem a chave, o painel fica oculto e a TV continua igual.
- `tests/presenca.test.js`: `node tests/presenca.test.js`.

## Fotos dos corretores

- `photos/Nome_Sobrenome.jpg` (600×600, recorte no rosto). O nome do arquivo é o nome exibido no pódio, nos desafios e na lista do QR de presença.
- O corretor do Amparo é reconhecido pelo primeiro nome (`roster` no `index.html` e `ROSTER` no `presence.js`; ex.: "Pedro Kauan" → Kauan Pereira). Corretor novo: adicione a foto e uma linha nas duas listas.
