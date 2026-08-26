// EXC001CLD — servidor mínimo do ambiente 06 · Colmeia
//
// Tudo o resto do site é servido como recurso estático, sem passar por aqui.
// Só /api/colmeia acorda este código, por isso o consumo é ínfimo.
//
// Sem a ligação DB declarada em wrangler.jsonc, responde 503 e a peça
// entra sozinha em modo solo: continua a funcionar, sem memória partilhada.

const LIMITE_MARCAS = 20;      // por pedido
const CELULAS = 217;           // 3·8²+3·8+1 = 217, o favo de raio 8

async function garantirTabela(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS favo (
      i INTEGER PRIMARY KEY,
      c INTEGER NOT NULL,
      t INTEGER NOT NULL,
      v TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS visitas (
      v TEXT PRIMARY KEY,
      n INTEGER NOT NULL DEFAULT 0,
      t INTEGER NOT NULL
    )`)
  ]);
}

async function estado(db) {
  const [celulas, contas] = await db.batch([
    db.prepare(`SELECT i, c, t FROM favo`),
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM favo) AS ocupadas,
      (SELECT COALESCE(SUM(n),0) FROM visitas) AS marcas,
      (SELECT COUNT(*) FROM visitas) AS maos,
      (SELECT COALESCE(MAX(t),0) FROM favo) AS ultima`)
  ]);
  const s = contas.results[0] || {};
  return {
    cells: celulas.results,
    stats: {
      filled: s.ocupadas | 0,
      marks: s.marcas | 0,
      hands: s.maos | 0,
      updated: s.ultima | 0
    }
  };
}

const json = (dados, status = 200) => new Response(JSON.stringify(dados), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS'
  }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return new Response('Não encontrado', { status: 404 });
    }
    if (request.method === 'OPTIONS') return json({ ok: true });

    if (url.pathname !== '/api/colmeia') {
      return json({ erro: 'rota desconhecida' }, 404);
    }
    if (!env.DB) {
      return json({ erro: 'sem base de dados ligada' }, 503);
    }

    try {
      await garantirTabela(env.DB);

      if (request.method === 'GET') {
        return json(await estado(env.DB));
      }

      if (request.method === 'POST') {
        const corpo = await request.json().catch(() => null);
        if (!corpo || !Array.isArray(corpo.marks)) {
          return json({ erro: 'corpo inválido' }, 400);
        }
        const visitante = String(corpo.id || '').slice(0, 24) || 'anon';
        const agora = Date.now();

        // sanidade: índices e cores dentro dos limites, sem repetições
        const vistos = new Set();
        const marcas = [];
        for (const m of corpo.marks) {
          const i = m.i | 0, c = m.c | 0;
          if (i < 0 || i >= CELULAS || c < 0 || c > 15) continue;
          if (vistos.has(i)) continue;
          vistos.add(i);
          marcas.push({ i, c });
          if (marcas.length >= LIMITE_MARCAS) break;
        }
        if (!marcas.length) return json(await estado(env.DB));

        const escritas = marcas.map(m => env.DB
          .prepare(`INSERT INTO favo (i,c,t,v) VALUES (?,?,?,?)
                    ON CONFLICT(i) DO UPDATE SET c=excluded.c, t=excluded.t, v=excluded.v`)
          .bind(m.i, m.c, agora, visitante));
        escritas.push(env.DB
          .prepare(`INSERT INTO visitas (v,n,t) VALUES (?,?,?)
                    ON CONFLICT(v) DO UPDATE SET n = n + excluded.n, t = excluded.t`)
          .bind(visitante, marcas.length, agora));
        await env.DB.batch(escritas);

        return json(await estado(env.DB));
      }

      return json({ erro: 'método não permitido' }, 405);
    } catch (e) {
      return json({ erro: 'falha no favo', detalhe: String(e).slice(0, 200) }, 500);
    }
  }
};
