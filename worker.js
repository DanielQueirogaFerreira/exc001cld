// EXC001CLD — servidor do ambiente 06 · Colmeia
//
// O ciclo não corre por tarefa agendada: o estado guarda o instante do último
// ciclo e, quando alguém pede o favo, avançamos a simulação até ao presente.
// Como a regra é determinística, dá o mesmo resultado seja quem for a pedir.
// Em repouso, custo zero.

const RAIO = 8;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const CICLO_MS = 60000;        // um ciclo por minuto, igual para toda a gente
const POLEN_MAX = 32;
const RECARGA_MS = 9000;
const CUSTO_NOVO = 2, CUSTO_PROA = 1;
const GRUPOS = 6;
const CORES = 8;
const INERCIA = 1.55, FRENTE = 1.0, FLANCO = 0.55, LIMIAR = 0.5;
const MAX_CICLOS_POR_PEDIDO = 30;
const VAZIO = '.';

// ---------- geometria ----------
const CELULAS = [];
const INDICE = new Map();
for (let q = -RAIO; q <= RAIO; q++) {
  for (let r = Math.max(-RAIO, -q - RAIO); r <= Math.min(RAIO, -q + RAIO); r++) {
    INDICE.set(q + ',' + r, CELULAS.length);
    CELULAS.push({ q, r });
  }
}
const N = CELULAS.length;                       // 217
const VIZINHOS = CELULAS.map(c => DIRS.map(d => {
  const i = INDICE.get((c.q + d[0]) + ',' + (c.r + d[1]));
  return i === undefined ? -1 : i;
}));

// ---------- estado como texto: dois caracteres por célula ----------
function serializar(cor, proa) {
  let s = '';
  for (let i = 0; i < N; i++) s += (cor[i] < 0 ? VAZIO : String(cor[i])) + String(proa[i]);
  return s;
}
function desserializar(s) {
  const cor = new Int8Array(N), proa = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const c = s[i * 2], d = s[i * 2 + 1];
    cor[i] = (c === VAZIO || c === undefined) ? -1 : (c.charCodeAt(0) - 48);
    proa[i] = d === undefined ? 0 : (d.charCodeAt(0) - 48) % 6;
  }
  return { cor, proa };
}

// ---------- semear ----------
function semear(partida) {
  const cor = new Int8Array(N).fill(-1), proa = new Uint8Array(N);
  const passo = CORES / GRUPOS;
  let semente = (partida * 2654435761) % 2147483647;
  if (semente <= 0) semente += 2147483646;
  const acaso = () => (semente = semente * 48271 % 2147483647) / 2147483647;
  for (let k = 0; k < GRUPOS; k++) {
    const c = Math.round(k * passo) % CORES;
    const ang = (Math.PI * 2 / GRUPOS) * k + 0.6;
    const q0 = Math.round(Math.cos(ang) * RAIO * 0.62);
    const r0 = Math.round(Math.sin(ang) * RAIO * 0.56);
    let inicio = INDICE.get(q0 + ',' + r0);
    if (inicio === undefined) inicio = Math.floor(acaso() * N);
    const alvo = (Math.round((ang + Math.PI) / (Math.PI / 3)) % 6 + 6) % 6;
    const fila = [inicio], vistos = new Set([inicio]);
    let n = 0;
    while (fila.length && n < 8) {
      const i = fila.shift();
      cor[i] = c; proa[i] = alvo; n++;
      for (let d = 0; d < 6; d++) {
        const v = VIZINHOS[i][d];
        if (v >= 0 && !vistos.has(v) && acaso() < 0.62) { vistos.add(v); fila.push(v); }
      }
    }
  }
  return { cor, proa };
}

// ---------- a regra ----------
function ciclo(cor, proa) {
  const nc = Int8Array.from(cor), np = Uint8Array.from(proa);
  let mudancas = 0;
  for (let i = 0; i < N; i++) {
    const forca = new Map();
    let apoio = -1, apoioPeso = 0;
    if (cor[i] >= 0) forca.set(cor[i], INERCIA);
    for (let d = 0; d < 6; d++) {
      const v = VIZINHOS[i][d];
      if (v < 0 || cor[v] < 0) continue;
      let peso = 0;
      if (VIZINHOS[v][proa[v]] === i) peso = FRENTE;
      else if (VIZINHOS[v][(proa[v] + 1) % 6] === i || VIZINHOS[v][(proa[v] + 5) % 6] === i) peso = FLANCO;
      if (!peso) continue;
      forca.set(cor[v], (forca.get(cor[v]) || 0) + peso);
      if (peso > apoioPeso) { apoioPeso = peso; apoio = v; }
    }
    if (!forca.size) continue;
    let vencedor = -1, maior = 0, segundo = 0;
    for (const [c, f] of forca) {
      if (f > maior) { segundo = maior; maior = f; vencedor = c; }
      else if (f > segundo) segundo = f;
    }
    if (vencedor < 0 || vencedor === cor[i]) continue;
    if (Math.abs(maior - segundo) < 1e-6) continue;
    if (cor[i] < 0 && maior < LIMIAR) continue;
    nc[i] = vencedor; mudancas++;
    if (apoio >= 0 && cor[apoio] === vencedor) np[i] = proa[apoio];
  }
  return { cor: nc, proa: np, mudancas };
}

function contar(cor) {
  const c = {};
  for (let i = 0; i < N; i++) if (cor[i] >= 0) c[cor[i]] = (c[cor[i]] || 0) + 1;
  return Object.keys(c).map(k => ({ c: +k, n: c[k] })).sort((a, b) => b.n - a.n);
}

// ---------- persistência ----------
async function tabelas(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS favo (
      id INTEGER PRIMARY KEY, partida INTEGER NOT NULL, estado TEXT NOT NULL,
      t INTEGER NOT NULL, versao INTEGER NOT NULL, parado INTEGER NOT NULL DEFAULT 0)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS jogadores (
      v TEXT PRIMARY KEY, polen REAL NOT NULL, t INTEGER NOT NULL,
      marcas INTEGER NOT NULL DEFAULT 0, cor INTEGER NOT NULL DEFAULT 0)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS partidas (
      partida INTEGER PRIMARY KEY, fim INTEGER NOT NULL, tabela TEXT NOT NULL)`)
  ]);
}

async function carregar(db) {
  let r = await db.prepare(`SELECT * FROM favo WHERE id=1`).first();
  if (!r) {
    const s = semear(1);
    r = { id: 1, partida: 1, estado: serializar(s.cor, s.proa), t: Date.now(), versao: 1, parado: 0 };
    await db.prepare(`INSERT INTO favo (id,partida,estado,t,versao,parado) VALUES (1,?,?,?,?,0)`)
      .bind(r.partida, r.estado, r.t, r.versao).run();
  }
  return r;
}

// avança a simulação até ao presente
async function atualizar(db, linha) {
  let { cor, proa } = desserializar(linha.estado);
  let t = linha.t, partida = linha.partida, parado = linha.parado, mexeu = false;
  const agora = Date.now();
  let voltas = Math.floor((agora - t) / CICLO_MS);
  if (voltas > MAX_CICLOS_POR_PEDIDO) {
    t = agora - CICLO_MS * MAX_CICLOS_POR_PEDIDO;
    voltas = MAX_CICLOS_POR_PEDIDO;
  }

  for (let k = 0; k < voltas; k++) {
    if (parado) {
      const tabela = JSON.stringify(contar(cor));
      await db.prepare(`INSERT OR REPLACE INTO partidas (partida,fim,tabela) VALUES (?,?,?)`)
        .bind(partida, t, tabela).run();
      partida += 1;
      const s = semear(partida);
      cor = s.cor; proa = s.proa; parado = 0;
    } else {
      const r = ciclo(cor, proa);
      cor = r.cor; proa = r.proa;
      if (r.mudancas === 0) parado = 1;
    }
    t += CICLO_MS; mexeu = true;
  }
  if (mexeu) {
    await db.prepare(`UPDATE favo SET partida=?, estado=?, t=?, versao=versao+1, parado=? WHERE id=1`)
      .bind(partida, serializar(cor, proa), t, parado).run();
  }
  return { cor, proa, t, partida, parado };
}

async function jogador(db, v) {
  const agora = Date.now();
  let j = await db.prepare(`SELECT * FROM jogadores WHERE v=?`).bind(v).first();
  if (!j) {
    j = { v, polen: POLEN_MAX, t: agora, marcas: 0, cor: 0 };
    await db.prepare(`INSERT INTO jogadores (v,polen,t,marcas,cor) VALUES (?,?,?,0,0)`)
      .bind(v, j.polen, j.t).run();
    return j;
  }
  j.polen = Math.min(POLEN_MAX, j.polen + (agora - j.t) / RECARGA_MS);
  j.t = agora;
  return j;
}

async function resposta(db, estado, j) {
  const r = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM jogadores`),
    db.prepare(`SELECT partida, tabela, fim FROM partidas ORDER BY partida DESC LIMIT 1`)
  ]);
  return {
    estado: serializar(estado.cor, estado.proa),
    partida: estado.partida,
    parado: !!estado.parado,
    proximo: estado.t + CICLO_MS - Date.now(),
    ciclo: CICLO_MS,
    tabela: contar(estado.cor),
    maos: ((r[0].results[0] || {}).n) | 0,
    ultimaPartida: (r[1].results[0] || null),
    polen: j ? Math.floor(j.polen) : null,
    polenMax: POLEN_MAX,
    recarga: RECARGA_MS,
    custo: { novo: CUSTO_NOVO, proa: CUSTO_PROA }
  };
}

const json = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s,
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
    if (!url.pathname.startsWith('/api/')) return new Response('Não encontrado', { status: 404 });
    if (request.method === 'OPTIONS') return json({ ok: true });
    if (url.pathname !== '/api/colmeia') return json({ erro: 'rota desconhecida' }, 404);
    if (!env.DB) return json({ erro: 'sem base de dados ligada' }, 503);

    try {
      await tabelas(env.DB);
      const linha = await carregar(env.DB);
      const estado = await atualizar(env.DB, linha);

      if (request.method === 'GET') {
        const v = url.searchParams.get('v');
        let j = null;
        if (v) {
          j = await jogador(env.DB, v.slice(0, 24));
          await env.DB.prepare(`UPDATE jogadores SET polen=?, t=? WHERE v=?`)
            .bind(j.polen, j.t, j.v).run();
        }
        return json(await resposta(env.DB, estado, j));
      }

      if (request.method === 'POST') {
        const corpo = await request.json().catch(() => null);
        if (!corpo || !Array.isArray(corpo.marks)) return json({ erro: 'corpo inválido' }, 400);
        const v = String(corpo.id || '').slice(0, 24) || 'anon';
        const j = await jogador(env.DB, v);

        const { cor, proa } = estado;
        let gastou = 0, aplicadas = 0, minhaCor = j.cor;
        for (const m of corpo.marks.slice(0, 24)) {
          const i = m.i | 0, c = m.c | 0, d = ((m.d | 0) % 6 + 6) % 6;
          if (i < 0 || i >= N || c < 0 || c >= CORES) continue;
          const custo = cor[i] === c ? CUSTO_PROA : CUSTO_NOVO;
          if (j.polen - gastou < custo) break;
          gastou += custo; aplicadas++; minhaCor = c;
          cor[i] = c; proa[i] = d;
        }
        if (aplicadas) {
          j.polen -= gastou;
          estado.parado = 0;                     // uma mão humana reabre o jogo
          await env.DB.batch([
            env.DB.prepare(`UPDATE favo SET estado=?, versao=versao+1, parado=0 WHERE id=1`)
              .bind(serializar(cor, proa)),
            env.DB.prepare(`UPDATE jogadores SET polen=?, t=?, marcas=marcas+?, cor=? WHERE v=?`)
              .bind(j.polen, j.t, aplicadas, minhaCor, v)
          ]);
        } else {
          await env.DB.prepare(`UPDATE jogadores SET polen=?, t=? WHERE v=?`)
            .bind(j.polen, j.t, v).run();
        }
        const r = await resposta(env.DB, estado, j);
        r.aplicadas = aplicadas;
        return json(r);
      }

      return json({ erro: 'método não permitido' }, 405);
    } catch (e) {
      return json({ erro: 'falha no favo', detalhe: String(e).slice(0, 300) }, 500);
    }
  }
};
