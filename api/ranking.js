const timeoutMs = 15000;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });

  const baseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) {
    return res.status(503).json({ error: 'Integração com o Amparo não configurada' });
  }

  try {
    const month = String(req.query?.month || '');
    const endpoint = new URL('/functions/v1/tv-ranking', baseUrl);
    if (/^\\d{4}-(0[1-9]|1[0-2])$/.test(month)) endpoint.searchParams.set('month', month);
    endpoint.searchParams.set('resource', 'ranking');

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + anonKey,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('[ranking-amparo]', response.status, data?.error || 'Falha na Edge Function');
      return res.status(502).json({ error: 'Não foi possível atualizar os dados do Amparo', retryable: true });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error('[ranking-amparo]', error.message);
    return res.status(502).json({ error: 'Amparo temporariamente indisponível', retryable: true });
  }
};
