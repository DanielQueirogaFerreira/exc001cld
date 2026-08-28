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
const ESQUEMA = 8;   // subir este número refaz as tabelas

async function tabelas(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT)`).run();
  const v = await db.prepare(`SELECT valor FROM meta WHERE chave='esquema'`).first();
  if (v && Number(v.valor) === ESQUEMA) return;
  // Só as tabelas de jogo se refazem quando o esquema muda: são estado de partida,
  // recriável. Contas, convites, inspeções e catálogo NUNCA se apagam — são trabalho
  // de pessoas, e já se perderam uma vez por minha causa.
  await db.batch([
    db.prepare(`DROP TABLE IF EXISTS favo`),
    db.prepare(`DROP TABLE IF EXISTS jogadores`),
    db.prepare(`DROP TABLE IF EXISTS partidas`),
    db.prepare(`DROP TABLE IF EXISTS salas`),
    db.prepare(`DROP TABLE IF EXISTS presencas`),
    db.prepare(`DROP TABLE IF EXISTS chaves`),
    db.prepare(`DROP TABLE IF EXISTS expedicoes`),
    db.prepare(`DROP TABLE IF EXISTS exp_membros`),
    db.prepare(`DROP TABLE IF EXISTS exp_achados`)
  ]);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS salas (
      sala TEXT PRIMARY KEY, dono TEXT NOT NULL, criada INTEGER NOT NULL,
      ciclo INTEGER NOT NULL, grupos INTEGER NOT NULL, recarga INTEGER NOT NULL,
      fase TEXT NOT NULL, estado TEXT NOT NULL, t INTEGER NOT NULL,
      partida INTEGER NOT NULL DEFAULT 1, parado INTEGER NOT NULL DEFAULT 0,
      visivel INTEGER NOT NULL DEFAULT 1, senha TEXT NOT NULL DEFAULT '',
      nome TEXT NOT NULL DEFAULT '', chave INTEGER NOT NULL DEFAULT 1,
      sistema INTEGER NOT NULL DEFAULT 1,
      expira INTEGER NOT NULL DEFAULT 30,        -- minutos sem uso; 0 = sem prazo
      cetro TEXT, regra TEXT NOT NULL DEFAULT 'fixo', cetro_t INTEGER NOT NULL DEFAULT 0,
      cetro_n INTEGER NOT NULL DEFAULT 5, volta INTEGER NOT NULL DEFAULT 0,
      anuncio TEXT, aplicado INTEGER NOT NULL DEFAULT 0,
      pciclo INTEGER, pgrupos INTEGER, precarga INTEGER,
      mexida INTEGER NOT NULL DEFAULT 0)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS chaves (
      sala TEXT NOT NULL, versao INTEGER NOT NULL, resumo TEXT NOT NULL,
      desde INTEGER NOT NULL, ate INTEGER, autor TEXT NOT NULL,
      PRIMARY KEY (sala, versao))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS presencas (
      sala TEXT NOT NULL, v TEXT NOT NULL, visto INTEGER NOT NULL,
      pronto INTEGER NOT NULL DEFAULT 0, cor INTEGER NOT NULL DEFAULT 0,
      polen REAL NOT NULL DEFAULT 32, tpolen INTEGER NOT NULL,
      marcas INTEGER NOT NULL DEFAULT 0, chegada INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (sala, v))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS partidas (
      sala TEXT NOT NULL, partida INTEGER NOT NULL, fim INTEGER NOT NULL,
      tabela TEXT NOT NULL, chave INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (sala, partida))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS expedicoes (
      cod TEXT PRIMARY KEY, criada INTEGER NOT NULL, dono TEXT NOT NULL,
      modo TEXT NOT NULL DEFAULT 'colaboracao', nome TEXT NOT NULL DEFAULT '')`),
    db.prepare(`CREATE TABLE IF NOT EXISTS exp_membros (
      cod TEXT NOT NULL, v TEXT NOT NULL, alcunha TEXT NOT NULL DEFAULT '',
      visto INTEGER NOT NULL, pontos INTEGER NOT NULL DEFAULT 0,
      achados INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (cod, v))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS exp_achados (
      cod TEXT NOT NULL, chave TEXT NOT NULL, v TEXT NOT NULL, nome TEXT NOT NULL,
      gal TEXT NOT NULL, tipo TEXT NOT NULL, proc TEXT NOT NULL, estado TEXT NOT NULL,
      pontos INTEGER NOT NULL DEFAULT 1, t INTEGER NOT NULL,
      PRIMARY KEY (cod, chave))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS contas (
      email TEXT PRIMARY KEY, nome TEXT NOT NULL DEFAULT '', sal TEXT NOT NULL,
      chave TEXT NOT NULL, papel TEXT NOT NULL DEFAULT 'inspetor',
      criada INTEGER NOT NULL, visto INTEGER NOT NULL DEFAULT 0)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessoes (
      tok TEXT PRIMARY KEY, email TEXT NOT NULL, expira INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS inspecoes (
      id TEXT PRIMARY KEY, coord TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT '',
      nome TEXT NOT NULL DEFAULT '', gal TEXT NOT NULL DEFAULT '',
      autor TEXT NOT NULL, veredito TEXT NOT NULL, nota TEXT NOT NULL DEFAULT '',
      t INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS convites (
      cod TEXT PRIMARY KEY, papel TEXT NOT NULL, criador TEXT NOT NULL,
      criado INTEGER NOT NULL, nota TEXT NOT NULL DEFAULT '',
      usado INTEGER, usado_por TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS catalogo (
      coord TEXT PRIMARY KEY, camada INTEGER NOT NULL DEFAULT 1,
      tipo TEXT NOT NULL, nome TEXT NOT NULL, gal TEXT NOT NULL,
      valor INTEGER NOT NULL DEFAULT 1, la REAL, lo REAL,
      nota TEXT NOT NULL DEFAULT '', autor TEXT NOT NULL, t INTEGER NOT NULL)`)
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
  const expira = limitar(cfg.expira === 0 ? 0 : (cfg.expira || 30), [0, 1440], 30);
  const agora = Date.now();
  const s = semear(1, grupos);
  let ultimo = null;
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const sala = codigo();
    try {
      await db.prepare(`INSERT INTO salas
        (sala,dono,criada,ciclo,grupos,recarga,fase,estado,t,partida,parado,visivel,senha,nome,
         expira,cetro,mexida)
        VALUES (?,?,?,?,?,?,'espera',?,?,1,0,?,?,?,?,?,?)`)
        .bind(sala, dono, agora, ciclo, grupos, recarga, serializar(s.cor, s.proa), agora,
              visivel, senha, nome, expira, dono, agora).run();
      await db.prepare(`INSERT INTO chaves (sala,versao,resumo,desde,ate,autor)
        VALUES (?,1,?,?,NULL,?)`).bind(sala, senha, agora, dono).run();
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
  await db.prepare(`UPDATE salas SET mexida=? WHERE sala=?`).bind(agora, sala).run();
  const p = await db.prepare(`SELECT * FROM presencas WHERE sala=? AND v=?`).bind(sala, v).first();
  if (!p) {
    await db.prepare(`INSERT INTO presencas (sala,v,visto,pronto,polen,tpolen,chegada) VALUES (?,?,?,?,?,?,?)`)
      .bind(sala, v, agora, pronto ? 1 : 0, POLEN_MAX, agora, agora).run();
    return { sala, v, visto: agora, pronto: pronto ? 1 : 0, polen: POLEN_MAX, tpolen: agora,
             marcas: 0, cor: 0, chegada: agora };
  }
  const np = pronto === null ? p.pronto : (pronto ? 1 : 0);
  await db.prepare(`UPDATE presencas SET visto=?, pronto=? WHERE sala=? AND v=?`)
    .bind(agora, np, sala, v).run();
  p.visto = agora; p.pronto = np;
  return p;
}

// quem manda a seguir, conforme a regra escolhida
async function proximoCetro(db, sala) {
  const agora = Date.now();
  const g = await db.prepare(
    `SELECT v, chegada, marcas FROM presencas WHERE sala=? AND visto > ? ORDER BY chegada`)
    .bind(sala.sala, agora - PRESENTE_MS).all();
  const gente = g.results;
  if (!gente.length) return sala.cetro;
  const regra = sala.regra;
  if (regra === 'aleatorio') return gente[Math.floor(Math.random() * gente.length)].v;
  if (regra === 'maior') return gente.slice().sort((a, b) => b.marcas - a.marcas)[0].v;
  if (regra === 'menor') return gente.slice().sort((a, b) => a.marcas - b.marcas)[0].v;
  // 'tempo' e 'chegada': passa ao seguinte na ordem de chegada
  const i = gente.findIndex(x => x.v === sala.cetro);
  return gente[(i + 1) % gente.length].v;
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
  let cetro = sala.cetro, volta = sala.volta, regraMexeu = false;
  for (let k = 0; k < voltas; k++) {
    // mudança anunciada entra em vigor no ciclo seguinte
    if (sala.pciclo || sala.precarga || sala.pgrupos) {
      if (sala.pciclo) { sala.ciclo = sala.pciclo; sala.pciclo = null; }
      if (sala.precarga) { sala.recarga = sala.precarga; sala.precarga = null; }
      sala.aplicado = Date.now();
      regraMexeu = true;
    }
    // rodízio do ceptro
    if (sala.regra !== 'fixo' && sala.regra !== 'solto' && cetro) {
      volta += 1;
      const alvo = sala.regra === 'aleatorio'
        ? Math.max(1, Math.round(1 + Math.random() * (sala.cetro_n - 1)))
        : sala.cetro_n;
      if (volta >= alvo) { volta = 0; cetro = await proximoCetro(db, { ...sala, cetro }); regraMexeu = true; }
    }
    if (parado) {
      await db.prepare(`INSERT OR REPLACE INTO partidas (sala,partida,fim,tabela,chave)
        VALUES (?,?,?,?,?)`)
        .bind(sala.sala, partida, t, JSON.stringify(contar(cor)), sala.chave || 1).run();
      partida += 1;
      if (sala.pgrupos) { sala.grupos = sala.pgrupos; sala.pgrupos = null; sala.aplicado = Date.now(); }
      const s = semear(partida, sala.grupos);
      cor = s.cor; proa = s.proa; parado = 0;
    } else {
      const r = ciclo(cor, proa);
      cor = r.cor; proa = r.proa;
      if (r.mudancas === 0) parado = 1;
    }
    t += CICLO_MS; mexeu = true;
  }
  if (mexeu || regraMexeu) {
    await db.prepare(`UPDATE salas SET estado=?, t=?, partida=?, parado=?, ciclo=?, recarga=?,
      grupos=?, pciclo=?, precarga=?, pgrupos=?, aplicado=?, cetro=?, volta=? WHERE sala=?`)
      .bind(serializar(cor, proa), t, partida, parado, sala.ciclo, sala.recarga, sala.grupos,
            sala.pciclo, sala.precarga, sala.pgrupos, sala.aplicado, cetro, volta, sala.sala).run();
    sala.t = t; sala.partida = partida; sala.parado = parado; sala.cetro = cetro; sala.volta = volta;
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
    chave: sala.chave || 1,
    sistema: !!sala.sistema,
    expira: sala.expira,
    cetro: sala.cetro,
    souCetro: !!(eu && sala.cetro === eu.v),
    souDonoSala: !!(eu && sala.dono === eu.v),
    regra: sala.regra,
    cetroN: sala.cetro_n,
    anuncio: sala.anuncio ? JSON.parse(sala.anuncio) : null,
    aplicado: sala.aplicado || 0,
    pendente: (sala.pciclo || sala.precarga || sala.pgrupos)
      ? { ciclo: sala.pciclo, recarga: sala.precarga, grupos: sala.pgrupos } : null,
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

async function autorizado(sala, dada, env) {
  if (!sala.senha) return true;
  if (sala.senha === await resumo(dada || '')) return true;
  // chave de sistema: só vale se a sala a permitir e se estiver configurada no Worker
  if (sala.sistema && env.CHAVE_SISTEMA && (dada || '') === env.CHAVE_SISTEMA) return true;
  return false;
}

async function abrirSala(db, cod) {
  return db.prepare(`SELECT * FROM salas WHERE sala=?`).bind(String(cod || '').toUpperCase().slice(0, 5)).first();
}

// ================= expedições do Cosmógrafo =================
const PONTOS = { DS: 1, DC: 5, visitado: 3, estudo: 2 };

async function cosmos(request, env, url) {
  await tabelas(env.DB);
  const agora = Date.now();

  if (request.method === 'GET') {
    const cod = (url.searchParams.get('cod') || '').toUpperCase().slice(0, 5);
    const v = (url.searchParams.get('v') || '').slice(0, 24);
    if (!cod) return json({ ok: true });
    return json(await retratoExp(env.DB, cod, v, agora));
  }

  const corpo = await request.json().catch(() => null);
  if (!corpo) return json({ erro: 'corpo inválido' }, 400);
  const v = String(corpo.id || '').slice(0, 24) || 'anon';
  const acao = corpo.acao || 'estado';

  if (acao === 'criar') {
    const modo = corpo.modo === 'concorrencia' ? 'concorrencia' : 'colaboracao';
    const nome = String(corpo.nome || '').slice(0, 24);
    for (let i = 0; i < 5; i++) {
      const cod = codigo();
      try {
        await env.DB.prepare(`INSERT INTO expedicoes (cod,criada,dono,modo,nome) VALUES (?,?,?,?,?)`)
          .bind(cod, agora, v, modo, nome).run();
        await entrarExp(env.DB, cod, v, corpo.alcunha, agora);
        return json(await retratoExp(env.DB, cod, v, agora));
      } catch (e) { /* código repetido */ }
    }
    return json({ erro: 'não foi possível criar expedição' }, 500);
  }

  const cod = String(corpo.cod || '').toUpperCase().slice(0, 5);
  const exp = await env.DB.prepare(`SELECT * FROM expedicoes WHERE cod=?`).bind(cod).first();
  if (!exp) return json({ erro: 'expedição não encontrada' }, 404);
  await entrarExp(env.DB, cod, v, corpo.alcunha, agora);

  if (acao === 'registar') {
    const a = corpo.achado || {};
    const chave = String(a.k || '').slice(0, 64);
    if (!chave) return json({ erro: 'achado sem chave' }, 400);
    const proc = a.p === 'DC' ? 'DC' : 'DS';
    const estado = a.e === 'visitado' ? 'visitado' : 'reconhecido';
    let pontos = PONTOS[proc] + (estado === 'visitado' ? PONTOS.visitado : 0)
               + (a.estudos ? Math.min(3, a.estudos | 0) * PONTOS.estudo : 0)
               + Math.max(0, Math.min(5, a.prec | 0))    // pontaria: até 5 por acertar no ponto
               + Math.max(0, Math.min(12, a.raro | 0));  // raridade do corpo encontrado
    const ja = await env.DB.prepare(`SELECT v, pontos, estado FROM exp_achados WHERE cod=? AND chave=?`)
      .bind(cod, chave).first();
    if (ja && exp.modo === 'colaboracao' && ja.v !== v && ja.estado === estado) {
      return json(await retratoExp(env.DB, cod, v, agora));   // já estava no mapa comum
    }
    const ganho = ja ? Math.max(0, pontos - ja.pontos) : pontos;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO exp_achados (cod,chave,v,nome,gal,tipo,proc,estado,pontos,t)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(cod,chave) DO UPDATE SET estado=excluded.estado, pontos=excluded.pontos, t=excluded.t`)
        .bind(cod, chave, v, String(a.n || '?').slice(0, 40), String(a.g || '?').slice(0, 40),
              String(a.tipo || '?').slice(0, 40), proc, estado, pontos, agora),
      env.DB.prepare(`UPDATE exp_membros SET pontos=pontos+?, achados=achados+? WHERE cod=? AND v=?`)
        .bind(ganho, ja ? 0 : 1, cod, v)
    ]);
    return json(await retratoExp(env.DB, cod, v, agora));
  }

  return json(await retratoExp(env.DB, cod, v, agora));
}

async function entrarExp(db, cod, v, alcunha, agora) {
  const nome = String(alcunha || '').slice(0, 18);
  const m = await db.prepare(`SELECT v FROM exp_membros WHERE cod=? AND v=?`).bind(cod, v).first();
  if (!m) {
    await db.prepare(`INSERT INTO exp_membros (cod,v,alcunha,visto) VALUES (?,?,?,?)`)
      .bind(cod, v, nome, agora).run();
  } else {
    await db.prepare(`UPDATE exp_membros SET visto=?${nome ? ', alcunha=?' : ''} WHERE cod=? AND v=?`)
      .bind(...(nome ? [agora, nome, cod, v] : [agora, cod, v])).run();
  }
}

async function retratoExp(db, cod, v, agora) {
  const exp = await db.prepare(`SELECT * FROM expedicoes WHERE cod=?`).bind(cod).first();
  if (!exp) return { erro: 'expedição não encontrada' };
  const r = await db.batch([
    db.prepare(`SELECT v, alcunha, pontos, achados, visto FROM exp_membros WHERE cod=? ORDER BY pontos DESC`).bind(cod),
    db.prepare(`SELECT chave, v, nome, gal, tipo, proc, estado, t FROM exp_achados
                WHERE cod=? ORDER BY t DESC LIMIT 240`).bind(cod)
  ]);
  const membros = r[0].results.map(m => ({
    alcunha: m.alcunha || 'sem nome', pontos: m.pontos | 0, achados: m.achados | 0,
    eu: m.v === v, online: (agora - m.visto) < 90000
  }));
  const achados = r[1].results
    .filter(a => exp.modo === 'colaboracao' || a.v === v)
    .map(a => ({ k: a.chave, n: a.nome, g: a.gal, tipo: a.tipo, p: a.proc, e: a.estado, meu: a.v === v }));
  return { cod, modo: exp.modo, nome: exp.nome, dono: exp.dono === v, membros, achados };
}

// ================= contas, sessões e inspeções =================
const SESSAO_MS = 1000 * 60 * 60 * 24 * 14;

async function derivar(senha, sal) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(sal), iterations: 30000, hash: 'SHA-256' }, base, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const aleatorio = (n) => {
  const b = new Uint8Array(n); crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
};
const emailOk = e => /^[^@ ]+@[^@ ]+\.[^@ ]{2,}$/.test(e);

async function quemE(db, tok) {
  if (!tok) return null;
  const s = await db.prepare(`SELECT * FROM sessoes WHERE tok=?`).bind(tok).first();
  if (!s || s.expira < Date.now()) return null;
  const c = await db.prepare(`SELECT email,nome,papel FROM contas WHERE email=?`).bind(s.email).first();
  return c || null;
}

async function contas(request, env, url) {
  if (!env.DB) return json({ erro: 'sem base de dados ligada' }, 503);
  try { await tabelas(env.DB); }
  catch (e) { return json({ erro: 'falha ao preparar as tabelas', detalhe: String((e && e.message) || e).slice(0, 300) }, 500); }
  const corpo = request.method === 'POST' ? await request.json().catch(() => null) : {};
  const tok = (corpo && corpo.tok) || url.searchParams.get('tok') || '';
  const acao = (corpo && corpo.acao) || url.searchParams.get('acao') || 'eu';
  const agora = Date.now();

  if (acao === 'eu') {
    const eu = await quemE(env.DB, tok);
    return json({ eu });
  }

  if (acao === 'registar') {
    const email = String(corpo.email || '').toLowerCase().trim().slice(0, 80);
    const senha = String(corpo.senha || '');
    if (!emailOk(email)) return json({ erro: 'email inválido' }, 400);
    if (senha.length < 8) return json({ erro: 'a senha precisa de pelo menos 8 caracteres' }, 400);
    const ja = await env.DB.prepare(`SELECT email FROM contas WHERE email=?`).bind(email).first();
    if (ja) return json({ erro: 'já existe conta com esse email' }, 409);
    const quantas = await env.DB.prepare(`SELECT COUNT(*) AS n FROM contas`).first();
    const primeira = (quantas.n | 0) === 0;
    let papel = 'inspetor', convite = null;
    if (primeira) {
      papel = 'administrador';                      // o primeiro fica com as chaves
    } else {
      const cod = String(corpo.convite || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (!cod) return json({ erro: 'é preciso um convite para criar conta' }, 403);
      convite = await env.DB.prepare(`SELECT * FROM convites WHERE cod=?`).bind(cod).first();
      if (!convite) return json({ erro: 'convite não existe' }, 403);
      if (convite.usado) return json({ erro: 'esse convite já foi usado' }, 403);
      papel = convite.papel === 'administrador' ? 'administrador' : 'inspetor';
    }
    const sal = aleatorio(16);
    const chave = await derivar(senha, sal);
    await env.DB.prepare(`INSERT INTO contas (email,nome,sal,chave,papel,criada,visto)
      VALUES (?,?,?,?,?,?,?)`).bind(email, String(corpo.nome || '').slice(0, 40), sal, chave, papel, agora, agora).run();
    const t = aleatorio(24);
    const passos = [env.DB.prepare(`INSERT INTO sessoes (tok,email,expira) VALUES (?,?,?)`)
      .bind(t, email, agora + SESSAO_MS)];
    if (convite) passos.push(env.DB.prepare(`UPDATE convites SET usado=?, usado_por=? WHERE cod=?`)
      .bind(agora, email, convite.cod));          // o convite queima-se ao entrar
    await env.DB.batch(passos);
    return json({ tok: t, eu: { email, nome: corpo.nome || '', papel } });
  }

  if (acao === 'entrar') {
    const email = String(corpo.email || '').toLowerCase().trim().slice(0, 80);
    const c = await env.DB.prepare(`SELECT * FROM contas WHERE email=?`).bind(email).first();
    if (!c) return json({ erro: 'email ou senha errados' }, 401);
    const chave = await derivar(String(corpo.senha || ''), c.sal);
    if (chave !== c.chave) return json({ erro: 'email ou senha errados' }, 401);
    const t = aleatorio(24);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO sessoes (tok,email,expira) VALUES (?,?,?)`).bind(t, email, agora + SESSAO_MS),
      env.DB.prepare(`UPDATE contas SET visto=? WHERE email=?`).bind(agora, email),
      env.DB.prepare(`DELETE FROM sessoes WHERE expira < ?`).bind(agora)
    ]);
    return json({ tok: t, eu: { email: c.email, nome: c.nome, papel: c.papel } });
  }

  if (acao === 'sair') {
    if (tok) await env.DB.prepare(`DELETE FROM sessoes WHERE tok=?`).bind(tok).run();
    return json({ ok: true });
  }

  const eu = await quemE(env.DB, tok);
  if (!eu) return json({ erro: 'sessão expirada' }, 401);

  if (acao === 'lista') {
    if (eu.papel !== 'administrador') return json({ erro: 'só administradores' }, 403);
    const r = await env.DB.prepare(`SELECT email,nome,papel,criada,visto FROM contas ORDER BY criada`).all();
    return json({ contas: r.results });
  }

  if (acao === 'convidar') {
    if (eu.papel !== 'administrador') return json({ erro: 'só administradores convidam' }, 403);
    const papel = corpo.papel === 'administrador' ? 'administrador' : 'inspetor';
    const cod = (aleatorio(4).toUpperCase().replace(/[^0-9A-F]/g, '') + '000000').slice(0, 8);
    await env.DB.prepare(`INSERT INTO convites (cod,papel,criador,criado,nota) VALUES (?,?,?,?,?)`)
      .bind(cod, papel, eu.email, Date.now(), String(corpo.nota || '').slice(0, 60)).run();
    const r = await env.DB.prepare(`SELECT * FROM convites ORDER BY criado DESC LIMIT 100`).all();
    return json({ cod, convites: r.results });
  }

  if (acao === 'convites') {
    if (eu.papel !== 'administrador') return json({ erro: 'só administradores' }, 403);
    const r = await env.DB.prepare(`SELECT * FROM convites ORDER BY criado DESC LIMIT 100`).all();
    return json({ convites: r.results });
  }

  if (acao === 'apagar-convite') {
    if (eu.papel !== 'administrador') return json({ erro: 'só administradores' }, 403);
    await env.DB.prepare(`DELETE FROM convites WHERE cod=? AND usado IS NULL`)
      .bind(String(corpo.cod || '').toUpperCase()).run();
    const r = await env.DB.prepare(`SELECT * FROM convites ORDER BY criado DESC LIMIT 100`).all();
    return json({ convites: r.results });
  }

  if (acao === 'papel') {
    if (eu.papel !== 'administrador') return json({ erro: 'só administradores' }, 403);
    const alvo = String(corpo.email || '').toLowerCase();
    const papel = corpo.papel === 'administrador' ? 'administrador' : 'inspetor';
    if (alvo === eu.email) return json({ erro: 'não pode mudar o seu próprio papel' }, 400);
    await env.DB.prepare(`UPDATE contas SET papel=? WHERE email=?`).bind(papel, alvo).run();
    return json({ ok: true });
  }

  return json({ erro: 'ação desconhecida' }, 400);
}

async function catalogo(request, env, url) {
  if (!env.DB) return json({ erro: 'sem base de dados ligada' }, 503);
  try { await tabelas(env.DB); }
  catch (e) { return json({ erro: 'falha ao preparar as tabelas', detalhe: String((e && e.message) || e).slice(0, 300) }, 500); }
  const corpo = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  const tok = (corpo && corpo.tok) || url.searchParams.get('tok') || '';
  const eu = await quemE(env.DB, tok);
  const acao = (corpo && corpo.acao) || url.searchParams.get('acao') || 'listar';

  if (acao === 'listar') {
    const camada = Number(url.searchParams.get('camada') || corpo.camada || 0);
    const r = camada
      ? await env.DB.prepare(`SELECT * FROM catalogo WHERE camada=? ORDER BY valor DESC, t DESC LIMIT 400`).bind(camada).all()
      : await env.DB.prepare(`SELECT * FROM catalogo ORDER BY valor DESC, t DESC LIMIT 400`).all();
    return json({ catalogo: r.results });
  }

  if (!eu) return json({ erro: 'sessão expirada' }, 401);

  if (acao === 'juntar') {
    const itens = Array.isArray(corpo.itens) ? corpo.itens.slice(0, 60) : [];
    if (!itens.length) return json({ erro: 'nada para juntar' }, 400);
    const camada = Math.max(1, Math.min(99, corpo.camada | 0 || 1));
    const agora = Date.now();
    const passos = itens
      .filter(i => /^EXC-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(String(i.cod || '')))
      .map(i => env.DB.prepare(`INSERT INTO catalogo (coord,camada,tipo,nome,gal,valor,la,lo,nota,autor,t)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(coord) DO UPDATE SET camada=excluded.camada, nota=excluded.nota, t=excluded.t`)
        .bind(String(i.cod), camada, String(i.tipo || '').slice(0, 40), String(i.nome || '').slice(0, 40),
              String(i.gal || '').slice(0, 40), i.valor | 0, i.la || null, i.lo || null,
              String(i.nota || '').slice(0, 200), eu.email, agora));
    if (!passos.length) return json({ erro: 'coordenadas mal formadas' }, 400);
    await env.DB.batch(passos);
    const r = await env.DB.prepare(`SELECT * FROM catalogo ORDER BY valor DESC, t DESC LIMIT 400`).all();
    return json({ catalogo: r.results, juntados: passos.length });
  }

  if (acao === 'apagar') {
    if (eu.papel !== 'administrador') return json({ erro: 'só administradores apagam do catálogo' }, 403);
    await env.DB.prepare(`DELETE FROM catalogo WHERE coord=?`).bind(String(corpo.coord || '')).run();
    const r = await env.DB.prepare(`SELECT * FROM catalogo ORDER BY valor DESC, t DESC LIMIT 400`).all();
    return json({ catalogo: r.results });
  }

  return json({ erro: 'ação desconhecida' }, 400);
}

async function inspecoes(request, env, url) {
  if (!env.DB) return json({ erro: 'sem base de dados ligada' }, 503);
  try { await tabelas(env.DB); }
  catch (e) { return json({ erro: 'falha ao preparar as tabelas', detalhe: String((e && e.message) || e).slice(0, 300) }, 500); }
  const corpo = request.method === 'POST' ? await request.json().catch(() => null) : {};
  const tok = (corpo && corpo.tok) || url.searchParams.get('tok') || '';
  const eu = await quemE(env.DB, tok);
  if (!eu) return json({ erro: 'sessão expirada' }, 401);
  const acao = (corpo && corpo.acao) || url.searchParams.get('acao') || 'listar';

  if (acao === 'listar') {
    const so = url.searchParams.get('minhas') === '1' || (corpo && corpo.minhas);
    const r = so
      ? await env.DB.prepare(`SELECT * FROM inspecoes WHERE autor=? ORDER BY t DESC LIMIT 200`).bind(eu.email).all()
      : await env.DB.prepare(`SELECT * FROM inspecoes ORDER BY t DESC LIMIT 200`).all();
    return json({ eu, inspecoes: r.results });
  }

  if (acao === 'criar') {
    const coord = String(corpo.coord || '').toUpperCase().slice(0, 20);
    if (!/^EXC-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(coord))
      return json({ erro: 'coordenada mal formada' }, 400);
    const veredito = ['confirmado', 'ajustar', 'quebrado'].includes(corpo.veredito) ? corpo.veredito : 'ajustar';
    await env.DB.prepare(`INSERT INTO inspecoes (id,coord,tipo,nome,gal,autor,veredito,nota,t)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(aleatorio(8), coord, String(corpo.tipo || '').slice(0, 40), String(corpo.nome || '').slice(0, 40),
            String(corpo.gal || '').slice(0, 40), eu.email, veredito, String(corpo.nota || '').slice(0, 600), Date.now())
      .run();
    const r = await env.DB.prepare(`SELECT * FROM inspecoes ORDER BY t DESC LIMIT 200`).all();
    return json({ eu, inspecoes: r.results });
  }

  if (acao === 'apagar') {
    const id = String(corpo.id || '');
    const alvo = await env.DB.prepare(`SELECT autor FROM inspecoes WHERE id=?`).bind(id).first();
    if (!alvo) return json({ erro: 'não existe' }, 404);
    if (alvo.autor !== eu.email && eu.papel !== 'administrador')
      return json({ erro: 'só o autor ou um administrador apaga' }, 403);
    await env.DB.prepare(`DELETE FROM inspecoes WHERE id=?`).bind(id).run();
    const r = await env.DB.prepare(`SELECT * FROM inspecoes ORDER BY t DESC LIMIT 200`).all();
    return json({ eu, inspecoes: r.results });
  }

  return json({ erro: 'ação desconhecida' }, 400);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return new Response('Não encontrado', { status: 404 });
    if (request.method === 'OPTIONS') return json({ ok: true });
    if (url.pathname === '/api/vida') {
      // quantas contas existem, sem revelar quem são: serve para saber
      // se a primeira já foi criada e se o esquema está de pé
      let contasN = null, inspN = null, esquema = null, aviso = null;
      if (env.DB) {
        try {
          await tabelas(env.DB);
          const r = await env.DB.batch([
            env.DB.prepare(`SELECT COUNT(*) AS n FROM contas`),
            env.DB.prepare(`SELECT COUNT(*) AS n FROM inspecoes`),
            env.DB.prepare(`SELECT valor FROM meta WHERE chave='esquema'`)
          ]);
          contasN = (r[0].results[0] || {}).n | 0;
          inspN = (r[1].results[0] || {}).n | 0;
          esquema = ((r[2].results[0] || {}).valor) || null;
        } catch (e) { aviso = String((e && e.message) || e).slice(0, 300); }
      }
      return json({
        ok: true, base: !!env.DB, esquema, contas: contasN, inspecoes: inspN, aviso,
        rotas: ['/api/vida', '/api/colmeia', '/api/cosmos', '/api/conta', '/api/inspecao', '/api/catalogo']
      });
    }
    try {
      if (url.pathname === '/api/cosmos') return await cosmos(request, env, url);
      if (url.pathname === '/api/conta') return await contas(request, env, url);
      if (url.pathname === '/api/inspecao') return await inspecoes(request, env, url);
      if (url.pathname === '/api/catalogo') return await catalogo(request, env, url);
    } catch (e) {
      // sem isto, uma exceção aqui devolvia a página de erro do Cloudflare em HTML
      return json({ erro: 'falha no servidor', detalhe: String((e && e.message) || e).slice(0, 300) }, 500);
    }
    if (url.pathname !== '/api/colmeia') return json({ erro: 'rota desconhecida' }, 404);
    if (!env.DB) return json({ erro: 'sem base de dados ligada' }, 503);

    try {
      await tabelas(env.DB);
      // salas com prazo que ficaram à espera sem ninguém: desaparecem
      if (Math.random() < 0.15) {
        const agora = Date.now();
        await env.DB.prepare(
          `DELETE FROM salas WHERE expira > 0 AND fase='espera' AND mexida < (? - expira*60000)`)
          .bind(agora).run();
      }

      // ---- consulta ----
      if (request.method === 'GET') {
        if (url.searchParams.get('radar')) return json({ salas: await radar(env.DB) });
        const cod = url.searchParams.get('sala');
        const v = (url.searchParams.get('v') || '').slice(0, 24);
        if (!cod) return json({ ok: true, pronto: true });      // teste de vida
        const sala = await abrirSala(env.DB, cod);
        if (!sala) return json({ erro: 'sala não encontrada' }, 404);
        if (!await autorizado(sala, url.searchParams.get('senha'), env))
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
      if (!await autorizado(sala, corpo.senha, env))
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

      if (acao === 'senha') {
        const souDono = sala.dono === v;
        const comSistema = sala.sistema && env.CHAVE_SISTEMA && corpo.senha === env.CHAVE_SISTEMA;
        if (!souDono && !comSistema) return json({ erro: 'só o dono da sala muda a senha' }, 403);
        const agora = Date.now();
        const nova = await resumo(String(corpo.nova || '').slice(0, 32));
        const versao = (sala.chave || 1) + 1;
        const permitirSistema = corpo.sistema === undefined ? sala.sistema : (corpo.sistema ? 1 : 0);
        await env.DB.batch([
          env.DB.prepare(`UPDATE chaves SET ate=? WHERE sala=? AND versao=?`)
            .bind(agora, sala.sala, sala.chave || 1),
          env.DB.prepare(`INSERT INTO chaves (sala,versao,resumo,desde,ate,autor)
            VALUES (?,?,?,?,NULL,?)`).bind(sala.sala, versao, nova, agora, v),
          env.DB.prepare(`UPDATE salas SET senha=?, chave=?, sistema=? WHERE sala=?`)
            .bind(nova, versao, permitirSistema, sala.sala)
        ]);
        sala.senha = nova; sala.chave = versao; sala.sistema = permitirSistema;
        const estado = await atualizar(env.DB, sala);
        const r = await retrato(env.DB, sala, estado, eu);
        r.chaveNova = versao;
        return json(r);
      }

      if (acao === 'chaveiro') {
        if (sala.dono !== v) return json({ erro: 'só o dono vê o chaveiro' }, 403);
        const h = await env.DB.prepare(
          `SELECT versao, desde, ate, autor FROM chaves WHERE sala=? ORDER BY versao`)
          .bind(sala.sala).all();
        const p = await env.DB.prepare(
          `SELECT partida, fim, chave FROM partidas WHERE sala=? ORDER BY partida`)
          .bind(sala.sala).all();
        return json({ chaveiro: h.results, partidas: p.results });
      }

      if (acao === 'cetro') {
        const souDono = sala.dono === v, souCetro = sala.cetro === v;
        const m = corpo.modo;
        if (m === 'pegar') {
          if (sala.cetro) return json({ erro: 'o ceptro já tem dono' }, 409);
          await env.DB.prepare(`UPDATE salas SET cetro=?, volta=0 WHERE sala=?`).bind(v, sala.sala).run();
          sala.cetro = v;
        } else if (!souDono && !souCetro) {
          return json({ erro: 'não tem o ceptro' }, 403);
        } else if (m === 'passar') {
          const para = String(corpo.para || '').slice(0, 24);
          await env.DB.prepare(`UPDATE salas SET cetro=?, volta=0 WHERE sala=?`).bind(para, sala.sala).run();
          sala.cetro = para;
        } else if (m === 'largar') {
          await env.DB.prepare(`UPDATE salas SET cetro=NULL, regra='solto' WHERE sala=?`).bind(sala.sala).run();
          sala.cetro = null; sala.regra = 'solto';
        } else if (m === 'retomar') {
          if (!souDono) return json({ erro: 'só quem criou retoma' }, 403);
          await env.DB.prepare(`UPDATE salas SET cetro=?, regra='fixo', volta=0 WHERE sala=?`)
            .bind(v, sala.sala).run();
          sala.cetro = v; sala.regra = 'fixo';
        } else if (m === 'regra') {
          const r = ['fixo', 'solto', 'tempo', 'aleatorio', 'chegada', 'maior', 'menor']
            .includes(corpo.regra) ? corpo.regra : 'fixo';
          const n = limitar(corpo.n || 5, [1, 50], 5);
          await env.DB.prepare(`UPDATE salas SET regra=?, cetro_n=?, volta=0 WHERE sala=?`)
            .bind(r, n, sala.sala).run();
          sala.regra = r; sala.cetro_n = n;
        }
        const estado = await atualizar(env.DB, sala);
        return json(await retrato(env.DB, sala, estado, eu));
      }

      if (acao === 'config') {
        if (sala.cetro !== v && sala.dono !== v) return json({ erro: 'não tem o ceptro' }, 403);
        const c = corpo.config || {};
        const pc = c.ciclo ? limitar(c.ciclo, LIMITES.ciclo, sala.ciclo) : null;
        const pr = c.recarga ? limitar(c.recarga, LIMITES.recarga, sala.recarga) : null;
        const pg = c.grupos ? limitar(c.grupos, LIMITES.grupos, sala.grupos) : null;
        const anuncio = JSON.stringify({
          por: v, quando: Date.now(), ciclo: pc, recarga: pr, grupos: pg
        });
        if (sala.fase === 'espera') {
          // ainda ninguém joga: entra já
          await env.DB.prepare(`UPDATE salas SET ciclo=?, recarga=?, grupos=?, anuncio=?, aplicado=? WHERE sala=?`)
            .bind(pc || sala.ciclo, pr || sala.recarga, pg || sala.grupos, anuncio, Date.now(), sala.sala).run();
          sala.ciclo = pc || sala.ciclo; sala.recarga = pr || sala.recarga; sala.grupos = pg || sala.grupos;
          sala.aplicado = Date.now();
          if (pg) {
            const s2 = semear(sala.partida, sala.grupos);
            await env.DB.prepare(`UPDATE salas SET estado=? WHERE sala=?`)
              .bind(serializar(s2.cor, s2.proa), sala.sala).run();
            sala.estado = serializar(s2.cor, s2.proa);
          }
        } else {
          await env.DB.prepare(`UPDATE salas SET pciclo=?, precarga=?, pgrupos=?, anuncio=? WHERE sala=?`)
            .bind(pc, pr, pg, anuncio, sala.sala).run();
          sala.pciclo = pc; sala.precarga = pr; sala.pgrupos = pg; sala.anuncio = anuncio;
        }
        const estado = await atualizar(env.DB, sala);
        return json(await retrato(env.DB, sala, estado, eu));
      }

      if (acao === 'fechar') {
        if (sala.dono !== v) return json({ erro: 'só quem criou fecha a sala' }, 403);
        await env.DB.prepare(`DELETE FROM salas WHERE sala=?`).bind(sala.sala).run();
        await env.DB.prepare(`DELETE FROM presencas WHERE sala=?`).bind(sala.sala).run();
        return json({ fechada: true });
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
