// EXC001CLD — servidor do ambiente 06 · Colmeia
//
// O ciclo não corre por tarefa agendada: o estado guarda o instante do último
// ciclo e, quando alguém pede o favo, avançamos a simulação até ao presente.
// Como a regra é determinística, dá o mesmo resultado seja quem for a pedir.
// Em repouso, custo zero.

const RAIO = 8;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const POLEN_MAX = 32;
const CUSTO_NOVO = 2, CUSTO_PROA = 1;
const CORES = 8;
const LIMITES = {
  ciclo:   [2, 300],      // segundos
  recarga: [1, 60],
  grupos:  [2, 8]
};
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
function semear(partida, GRUPOS) {
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
    const porGrupo = Math.max(4, Math.round(48 / GRUPOS));
    while (fila.length && n < porGrupo) {
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
const ESQUEMA = 3;   // subir este número refaz as tabelas

async function tabelas(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT)`).run();
  const v = await db.prepare(`SELECT valor FROM meta WHERE chave='esquema'`).first();
  if (v && Number(v.valor) === ESQUEMA) return;
  // versões antigas ficam para trás: nada aqui vale mais do que a coerência
  await db.batch([
    db.prepare(`DROP TABLE IF EXISTS favo`),
    db.prepare(`DROP TABLE IF EXISTS jogadores`),
    db.prepare(`DROP TABLE IF EXISTS partidas`),
    db.prepare(`DROP TABLE IF EXISTS salas`),
    db.prepare(`DROP TABLE IF EXISTS presencas`)
  ]);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS salas (
      sala TEXT PRIMARY KEY, dono TEXT NOT NULL, criada INTEGER NOT NULL,
      ciclo INTEGER NOT NULL, grupos INTEGER NOT NULL, recarga INTEGER NOT NULL,
      fase TEXT NOT NULL, estado TEXT NOT NULL, t INTEGER NOT NULL,
      partida INTEGER NOT NULL DEFAULT 1, parado INTEGER NOT NULL DEFAULT 0,
      visivel INTEGER NOT NULL DEFAULT 1, senha TEXT NOT NULL DEFAULT '',
      nome TEXT NOT NULL DEFAULT '')`),
    db.prepare(`CREATE TABLE IF NOT EXISTS presencas (
      sala TEXT NOT NULL, v TEXT NOT NULL, visto INTEGER NOT NULL,
      pronto INTEGER NOT NULL DEFAULT 0, cor INTEGER NOT NULL DEFAULT 0,
      polen REAL NOT NULL DEFAULT 32, tpolen INTEGER NOT NULL,
      marcas INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (sala, v))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS partidas (
      sala TEXT NOT NULL, partida INTEGER NOT NULL, fim INTEGER NOT NULL,
      tabela TEXT NOT NULL, PRIMARY KEY (sala, partida))`)
  ]);
  await db.prepare(`INSERT OR REPLACE INTO meta (chave,valor) VALUES ('esquema',?)`)
    .bind(String(ESQUEMA)).run();
}

// ---------- senha ----------
async function resumo(txt) {
  if (!txt) return '';
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('colmeia:' + txt));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sem O/0 nem I/1
function codigo() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALFA[Math.floor(Math.random() * ALFA.length)];
  return s;
}
const limitar = (v, [min, max], pad) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : pad;
};
const PRESENTE_MS = 40000;      // considera-se presente quem deu sinal há menos disto

async function criarSala(db, dono, cfg) {
  const ciclo = limitar(cfg.ciclo, LIMITES.ciclo, 60);
  const grupos = limitar(cfg.grupos, LIMITES.grupos, 4);
  const recarga = limitar(cfg.recarga, LIMITES.recarga, 9);
  const visivel = cfg.visivel === false ? 0 : 1;
  const senha = await resumo(String(cfg.senha || '').slice(0, 32));
  const nome = String(cfg.nome || '').slice(0, 24);
  const agora = Date.now();
  const s = semear(1, grupos);
  let ultimo = null;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const sala = codigo();
    try {
      await db.prepare(`INSERT INTO salas
        (sala,dono,criada,ciclo,grupos,recarga,fase,estado,t,partida,parado,visivel,senha,nome)
        VALUES (?,?,?,?,?,?,'espera',?,?,1,0,?,?,?)`)
        .bind(sala, dono, agora, ciclo, grupos, recarga, serializar(s.cor, s.proa), agora,
              visivel, senha, nome).run();
      return sala;
    } catch (e) { ultimo = e; }
  }
  throw new Error('não foi possível criar sala: ' + String(ultimo).slice(0, 120));
}

// ---------- radar: salas abertas ----------
async function radar(db) {
  const agora = Date.now();
  const r = await db.prepare(
    `SELECT s.sala, s.fase, s.ciclo, s.grupos, s.recarga, s.criada, s.nome,
            (s.senha <> '') AS trancada,
            (SELECT COUNT(*) FROM presencas p WHERE p.sala=s.sala AND p.visto > ?) AS gente
     FROM salas s
     WHERE s.visivel=1 AND s.criada > ?
     ORDER BY gente DESC, s.criada DESC LIMIT 24`)
    .bind(agora - PRESENTE_MS, agora - 1000 * 60 * 60 * 12).all();
  return r.results.map(x => ({
    sala: x.sala, fase: x.fase, gente: x.gente | 0, trancada: !!x.trancada, nome: x.nome || '',
    config: { ciclo: x.ciclo, grupos: x.grupos, recarga: x.recarga },
    idade: Math.round((agora - x.criada) / 60000)
  }));
}

async function marcarPresenca(db, sala, v, pronto) {
  const agora = Date.now();
  const p = await db.prepare(`SELECT * FROM presencas WHERE sala=? AND v=?`).bind(sala, v).first();
  if (!p) {
    await db.prepare(`INSERT INTO presencas (sala,v,visto,pronto,polen,tpolen) VALUES (?,?,?,?,?,?)`)
      .bind(sala, v, agora, pronto ? 1 : 0, POLEN_MAX, agora).run();
    return { sala, v, visto: agora, pronto: pronto ? 1 : 0, polen: POLEN_MAX, tpolen: agora, marcas: 0, cor: 0 };
  }
  const np = pronto === null ? p.pronto : (pronto ? 1 : 0);
  await db.prepare(`UPDATE presencas SET visto=?, pronto=? WHERE sala=? AND v=?`)
    .bind(agora, np, sala, v).run();
  p.visto = agora; p.pronto = np;
  return p;
}

// avança os ciclos até ao presente, só se a sala estiver a jogar
async function atualizar(db, sala) {
  let { cor, proa } = desserializar(sala.estado);
  let t = sala.t, partida = sala.partida, parado = sala.parado, mexeu = false;
  if (sala.fase !== 'a jogar') return { cor, proa, t, partida, parado };
  const CICLO_MS = sala.ciclo * 1000;
  const agora = Date.now();
  let voltas = Math.floor((agora - t) / CICLO_MS);
  if (voltas > MAX_CICLOS_POR_PEDIDO) {
    t = agora - CICLO_MS * MAX_CICLOS_POR_PEDIDO;
    voltas = MAX_CICLOS_POR_PEDIDO;
  }
  for (let k = 0; k < voltas; k++) {
    if (parado) {
      await db.prepare(`INSERT OR REPLACE INTO partidas (sala,partida,fim,tabela) VALUES (?,?,?,?)`)
        .bind(sala.sala, partida, t, JSON.stringify(contar(cor))).run();
      partida += 1;
      const s = semear(partida, sala.grupos);
      cor = s.cor; proa = s.proa; parado = 0;
    } else {
      const r = ciclo(cor, proa);
      cor = r.cor; proa = r.proa;
      if (r.mudancas === 0) parado = 1;
    }
    t += CICLO_MS; mexeu = true;
  }
  if (mexeu) {
    await db.prepare(`UPDATE salas SET estado=?, t=?, partida=?, parado=? WHERE sala=?`)
      .bind(serializar(cor, proa), t, partida, parado, sala.sala).run();
    sala.t = t; sala.partida = partida; sala.parado = parado;
  }
  return { cor, proa, t, partida, parado };
}

async function retrato(db, sala, estado, eu) {
  const agora = Date.now();
  const pres = await db.prepare(
    `SELECT v, pronto, cor, marcas, visto FROM presencas WHERE sala=? AND visto > ?`)
    .bind(sala.sala, agora - PRESENTE_MS).all();
  const gente = pres.results.map(p => ({
    v: p.v, pronto: !!p.pronto, cor: p.cor, marcas: p.marcas, eu: p.v === (eu && eu.v)
  }));
  const ultima = await db.prepare(
    `SELECT partida, tabela, fim FROM partidas WHERE sala=? ORDER BY partida DESC LIMIT 1`)
    .bind(sala.sala).first();
  return {
    sala: sala.sala,
    nome: sala.nome || '',
    visivel: !!sala.visivel,
    trancada: !!sala.senha,
    fase: sala.fase,
    dono: sala.dono === (eu && eu.v),
    config: { ciclo: sala.ciclo, grupos: sala.grupos, recarga: sala.recarga },
    estado: serializar(estado.cor, estado.proa),
    partida: estado.partida,
    parado: !!estado.parado,
    proximo: sala.fase === 'a jogar' ? (estado.t + sala.ciclo * 1000 - agora) : null,
    ciclo: sala.ciclo * 1000,
    tabela: contar(estado.cor),
    gente,
    maos: gente.length,
    ultimaPartida: ultima || null,
    polen: eu ? Math.floor(eu.polen) : null,
    polenMax: POLEN_MAX,
    recarga: sala.recarga * 1000,
    custo: { novo: CUSTO_NOVO, proa: CUSTO_PROA }
  };
}

function repor(eu, recargaMs) {
  const agora = Date.now();
  eu.polen = Math.min(POLEN_MAX, eu.polen + (agora - eu.tpolen) / recargaMs);
  eu.tpolen = agora;
  return eu;
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

async function abrirSala(db, cod) {
  return db.prepare(`SELECT * FROM salas WHERE sala=?`).bind(String(cod || '').toUpperCase().slice(0, 5)).first();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return new Response('Não encontrado', { status: 404 });
    if (request.method === 'OPTIONS') return json({ ok: true });
    if (url.pathname !== '/api/colmeia') return json({ erro: 'rota desconhecida' }, 404);
    if (!env.DB) return json({ erro: 'sem base de dados ligada' }, 503);

    try {
      await tabelas(env.DB);

      // ---- consulta ----
      if (request.method === 'GET') {
        if (url.searchParams.get('radar')) return json({ salas: await radar(env.DB) });
        const cod = url.searchParams.get('sala');
        const v = (url.searchParams.get('v') || '').slice(0, 24);
        if (!cod) return json({ ok: true, pronto: true });      // teste de vida
        const sala = await abrirSala(env.DB, cod);
        if (!sala) return json({ erro: 'sala não encontrada' }, 404);
        if (sala.senha && sala.senha !== await resumo(url.searchParams.get('senha') || ''))
          return json({ erro: 'senha errada', trancada: true }, 403);
        let eu = v ? await marcarPresenca(env.DB, sala.sala, v, null) : null;
        if (eu) {
          repor(eu, sala.recarga * 1000);
          await env.DB.prepare(`UPDATE presencas SET polen=?, tpolen=? WHERE sala=? AND v=?`)
            .bind(eu.polen, eu.tpolen, sala.sala, v).run();
        }
        const estado = await atualizar(env.DB, sala);
        return json(await retrato(env.DB, sala, estado, eu));
      }

      // ---- ações ----
      const corpo = await request.json().catch(() => null);
      if (!corpo) return json({ erro: 'corpo inválido' }, 400);
      const v = String(corpo.id || '').slice(0, 24) || 'anon';
      const acao = corpo.acao || 'marcar';

      if (acao === 'criar') {
        const sala = await criarSala(env.DB, v, corpo.config || {});
        await marcarPresenca(env.DB, sala, v, false);
        const linha = await abrirSala(env.DB, sala);
        const eu = await marcarPresenca(env.DB, sala, v, null);
        const estado = await atualizar(env.DB, linha);
        return json(await retrato(env.DB, linha, estado, eu));
      }

      const sala = await abrirSala(env.DB, corpo.sala);
      if (!sala) return json({ erro: 'sala não encontrada' }, 404);
      if (sala.senha && sala.senha !== await resumo(corpo.senha || ''))
        return json({ erro: 'senha errada', trancada: true }, 403);
      let eu = await marcarPresenca(env.DB, sala.sala, v, acao === 'pronto' ? !!corpo.pronto : null);
      repor(eu, sala.recarga * 1000);

      if (acao === 'pronto' || acao === 'comecar') {
        if (acao === 'comecar' && sala.fase === 'espera') {
          await env.DB.prepare(`UPDATE salas SET fase='a jogar', t=? WHERE sala=?`)
            .bind(Date.now(), sala.sala).run();
          sala.fase = 'a jogar'; sala.t = Date.now();
        } else if (sala.fase === 'espera') {
          // toda a gente presente e pronta faz o jogo arrancar sozinho
          const agora = Date.now();
          const p = await env.DB.prepare(
            `SELECT COUNT(*) AS n, SUM(pronto) AS p FROM presencas WHERE sala=? AND visto > ?`)
            .bind(sala.sala, agora - PRESENTE_MS).first();
          if ((p.n | 0) >= 1 && (p.p | 0) === (p.n | 0)) {
            await env.DB.prepare(`UPDATE salas SET fase='a jogar', t=? WHERE sala=?`)
              .bind(agora, sala.sala).run();
            sala.fase = 'a jogar'; sala.t = agora;
          }
        }
        const estado = await atualizar(env.DB, sala);
        return json(await retrato(env.DB, sala, estado, eu));
      }

      if (acao === 'marcar') {
        const estado = await atualizar(env.DB, sala);
        if (sala.fase !== 'a jogar') {
          return json(await retrato(env.DB, sala, estado, eu));
        }
        const { cor, proa } = estado;
        let gastou = 0, aplicadas = 0, minhaCor = eu.cor;
        for (const m of (corpo.marks || []).slice(0, 24)) {
          const i = m.i | 0, c = m.c | 0, d = ((m.d | 0) % 6 + 6) % 6;
          if (i < 0 || i >= N || c < 0 || c >= CORES) continue;
          const custo = cor[i] === c ? CUSTO_PROA : CUSTO_NOVO;
          if (eu.polen - gastou < custo) break;
          gastou += custo; aplicadas++; minhaCor = c;
          cor[i] = c; proa[i] = d;
        }
        if (aplicadas) {
          eu.polen -= gastou; estado.parado = 0;
          await env.DB.batch([
            env.DB.prepare(`UPDATE salas SET estado=?, parado=0 WHERE sala=?`)
              .bind(serializar(cor, proa), sala.sala),
            env.DB.prepare(`UPDATE presencas SET polen=?, tpolen=?, marcas=marcas+?, cor=? WHERE sala=? AND v=?`)
              .bind(eu.polen, eu.tpolen, aplicadas, minhaCor, sala.sala, v)
          ]);
        } else {
          await env.DB.prepare(`UPDATE presencas SET polen=?, tpolen=? WHERE sala=? AND v=?`)
            .bind(eu.polen, eu.tpolen, sala.sala, v).run();
        }
        const r = await retrato(env.DB, sala, estado, eu);
        r.aplicadas = aplicadas;
        return json(r);
      }

      return json({ erro: 'ação desconhecida' }, 400);
    } catch (e) {
      return json({ erro: 'falha no favo', detalhe: String(e).slice(0, 300) }, 500);
    }
  }
};
