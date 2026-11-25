const crypto = require('crypto');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'ponto:state';

const redis = async (cmds) => {
  const r = await fetch(URL_ + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return r.json();
};

const same = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.SYNC_KEY || !URL_ || !TOKEN) return res.status(500).json({ error: 'servidor não configurado' });
  if (!same(req.headers['x-sync-key'], process.env.SYNC_KEY)) return res.status(401).json({ error: 'chave inválida' });

  try {
    const [{ result }] = await redis([['GET', KEY]]);
    const cur = result ? JSON.parse(result) : { rev: 0, data: null };

    if (req.method === 'GET') return res.status(200).json(cur);

    if (req.method === 'PUT') {
      const { baseRev, data } = req.body || {};
      if (!data || !Array.isArray(data.employees)) return res.status(400).json({ error: 'dados inválidos' });
      if (baseRev !== cur.rev) return res.status(409).json(cur);
      const next = { rev: cur.rev + 1, data };
      const cmds = [['SET', KEY, JSON.stringify(next)]];
      if (result) cmds.unshift(['SET', 'ponto:prev', result]);
      await redis(cmds);
      return res.status(200).json({ rev: next.rev });
    }
    return res.status(405).json({ error: 'método não permitido' });
  } catch (e) {
    return res.status(502).json({ error: 'falha ao acessar o banco' });
  }
};
