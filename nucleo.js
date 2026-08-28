// EXC001CLD — núcleo determinístico do Cosmógrafo
// Uma só verdade: o mesmo código gera os lugares na peça e na administração.
(function(raiz){
"use strict";
const GAL=[
  {n:'Via Láctea',            d:0,        cor:[190,205,255], tipo:'espiral barrada'},
  {n:'Sagitário Anã Elíptica',d:70000,    cor:[255,190,140], tipo:'anã esferoidal'},
  {n:'Grande Nuvem de Magalhães', d:163000, cor:[150,215,255], tipo:'irregular'},
  {n:'Pequena Nuvem de Magalhães', d:200000, cor:[135,190,240], tipo:'irregular anã'},
  {n:'Ursa Menor Anã',        d:200000,   cor:[210,200,255], tipo:'anã esferoidal'},
  {n:'Draco Anã',             d:260000,   cor:[180,170,235], tipo:'anã esferoidal'},
  {n:'Sextans Anã',           d:290000,   cor:[235,200,220], tipo:'anã esferoidal'},
  {n:'Escultor Anã',          d:290000,   cor:[200,235,225], tipo:'anã esferoidal'},
  {n:'Carina Anã',            d:330000,   cor:[255,215,180], tipo:'anã esferoidal'},
  {n:'Fornax Anã',            d:460000,   cor:[230,180,255], tipo:'anã esferoidal'},
  {n:'Leo II',                d:690000,   cor:[190,230,255], tipo:'anã esferoidal'},
  {n:'Leo I',                 d:820000,   cor:[255,205,225], tipo:'anã esferoidal'},
  {n:'NGC 6822',              d:1600000,  cor:[255,225,170], tipo:'irregular anã'},
  {n:'IC 10',                 d:2200000,  cor:[255,175,175], tipo:'irregular de rebentação'},
  {n:'Galáxia de Andrómeda',  d:2540000,  cor:[175,195,255], tipo:'espiral'},
  {n:'Galáxia do Triângulo',  d:2730000,  cor:[190,255,225], tipo:'espiral'}
];

// marcos reais: objetos observados, com o que deles se sabe (DC)
const MARCOS=[
  {g:0, n:'Sagitário A*', f:'buraco negro supermassivo no centro da Via Láctea, a cerca de 26 000 anos-luz'},
  {g:0, n:'Nebulosa de Órion', f:'berçário de estrelas a 1 344 anos-luz, visível a olho nu'},
  {g:0, n:'Enxame das Plêiades', f:'enxame aberto jovem, a 444 anos-luz'},
  {g:2, n:'Nebulosa da Tarântula', f:'a região de formação estelar mais luminosa do Grupo Local'},
  {g:2, n:'R136a1', f:'uma das estrelas mais maciças conhecidas, no coração da Tarântula'},
  {g:2, n:'SN 1987A', f:'a supernova mais próxima observada desde a invenção do telescópio'},
  {g:3, n:'NGC 346', f:'enxame jovem na Pequena Nuvem, fábrica de estrelas maciças'},
  {g:14,n:'Núcleo duplo de Andrómeda', f:'duas concentrações estelares em torno do buraco negro central'},
  {g:14,n:'NGC 206', f:'a maior nuvem de estrelas jovens de Andrómeda'},
  {g:15,n:'NGC 604', f:'região de hidrogénio ionizado quarenta vezes maior que Órion'},
  {g:12,n:'Nebulosa Hubble V', f:'região de formação estelar intensa em NGC 6822'},
  {g:1, n:'Messier 54', f:'enxame globular no coração da Anã de Sagitário'}
];

const TIPOS=[
  {n:'mundo com atmosfera', peso:7, glifo:'planeta', notavel:3,
   d:'Corpo rochoso com envelope gasoso. Textura, clima e satélite gerados a partir da posição.'},
  {n:'nebulosa de emissão', peso:4, glifo:'nebulosa', notavel:3,
   d:'Gás ionizado por estrelas jovens, com filamentos e faixas de poeira que travam a luz.'},
  {n:'buraco negro estelar', peso:2, glifo:'poco', notavel:4,
   d:'Disco de acreção com feixe relativista, anel de fotões e a sombra do horizonte.'},
  {n:'sistema planetário', peso:20, glifo:'sistema', notavel:2,
   d:'Uma estrela e as suas órbitas. O berço mais comum de tudo o resto.'},
  {n:'planeta errante',    peso:11, glifo:'sistema', notavel:2,
   d:'Mundo sem estrela, arrancado do seu sistema. Frio, escuro e silencioso.'},
  {n:'nuvem molecular',    peso:12, glifo:'nuvem',   notavel:1,
   d:'Berço frio de hidrogénio onde as estrelas ainda não acenderam.'},
  {n:'berçário estelar',   peso:7,  glifo:'nuvem',   notavel:2,
   d:'Nuvem em colapso, com estrelas a nascer às centenas.'},
  {n:'enxame globular',    peso:9,  glifo:'enxame',  notavel:1,
   d:'Centenas de milhares de estrelas velhas presas pela própria gravidade.'},
  {n:'campo de estrelas',  peso:15, glifo:'campo',   notavel:0,
   d:'Povoação dispersa. O tecido comum de uma galáxia.'},
  {n:'braço espiral',      peso:7,  glifo:'braco',   notavel:1,
   d:'Onda de densidade que comprime o gás e acende estrelas à passagem.'},
  {n:'remanescente de supernova', peso:6, glifo:'anel', notavel:2,
   d:'A casca em expansão do que sobrou de uma estrela morta.'},
  {n:'anomalia dimensional', peso:1, glifo:'poco',   notavel:4,
   d:'Métrica que não fecha. Raríssima, e ninguém sabe explicar o que se mede lá dentro.'},
  {n:'vazio intergaláctico', peso:8, glifo:'vazio',  notavel:0,
   d:'Quase nada por muito espaço. O fundo sobre o qual tudo o resto se destaca.'}
];
// raridade define o valor: o que aparece pouco vale muito
(function(){
  const total=TIPOS.reduce((a,e)=>a+e.peso,0);
  TIPOS.forEach(e=>{ e.freq=e.peso/total; e.valor=Math.max(1,Math.round(Math.pow(1/e.freq,0.72)/1.6)); });
})();
// camadas de hipótese: tudo isto é sintético e vai assinalado como tal
const QUIMICA=['metano e amónia','água em subsuperfície','silicatos e ferro','enxofre vulcânico',
  'hidrogénio metálico','carbono cristalizado','azoto líquido','cloretos em salmoura',
  'atmosfera de dióxido de carbono','vapores de silício'];
const CIVIL=['sem sinal de vida','microbiologia extremófila','biosfera vegetal','vida aquática complexa',
  'sociedade pré-industrial','civilização de rádio','civilização orbital','inteligência distribuída',
  'ruínas sem construtores','sinal repetido sem origem'];
const TECNO=['nenhuma','ferramentas de pedra','metalurgia','máquinas a vapor','eletricidade',
  'foguetes químicos','velas solares','dobra de espaço teórica','esferas de captação estelar',
  'engenharia de horizontes'];
const DIMENSAO=['estável','maré gravitacional forte','tempo dilatado','anisotropia luminosa',
  'eco de matéria escura','fenda métrica'];
const PREFIXO=['Kepler','Vega','Rigel','Tycho','Mira','Altair','Deneb','Antares','Spica','Bellatrix',
  'Elnath','Sadr','Izar','Merak','Talitha','Alcor','Nashira','Sabik','Zosma','Yed'];

function pesado(lista,r){
  const total=lista.reduce((a,e)=>a+e.peso,0);
  let acc=0, alvo=r*total;
  for(const e of lista){ acc+=e.peso; if(alvo<=acc) return e; }
  return lista[0];
}

function hash(x,y,s){
  let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(s|0,2147483647);
  h=Math.imul(h^(h>>>13),1274126177);
  return ((h^(h>>>16))>>>0)/4294967296;
}
function ruido(x,y,s){
  const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
  const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
  const a=hash(xi,yi,s), b=hash(xi+1,yi,s), c=hash(xi,yi+1,s), d=hash(xi+1,yi+1,s);
  return (a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v;
}
function fbm(x,y,s){
  let t=0,a=.5,f=1;
  for(let i=0;i<4;i++){ t+=a*ruido(x*f,y*f,s+i*7); f*=2.03; a*=.5; }
  return t;
}
// a que galáxia pertence este pedaço de Terra: manchas contínuas, de centenas de km
function galaxiaEm(lat,lon){
  const x=lon/2.2, y=lat/2.2;
  const wx=x+fbm(x*0.7,y*0.7,11)*1.6, wy=y+fbm(x*0.7+40,y*0.7+40,29)*1.6;
  let melhor=0, md=1e9;
  for(let i=0;i<GAL.length;i++){
    const sx=(hash(i,0,5)-0.5)*180/2.2, sy=(hash(0,i,9)-0.5)*90/2.2;
    const d=(wx-sx)*(wx-sx)+(wy-sy)*(wy-sy)*1.6;
    if(d<md){ md=d; melhor=i; }
  }
  return melhor;
}
// estrutura à escala do passo: muda a cada ~500 m

// há aqui um marco real? raro, e só na galáxia certa
function marcoEm(lat,lon,gi){
  const cel=Math.floor(lon/0.0009)*7919 ^ Math.floor(lat/0.0009)*104729;
  const r=hash(cel,gi,777);
  const daGal=MARCOS.filter(m=>m.g===gi);
  if(!daGal.length || r>0.0055) return null;
  return daGal[Math.floor(hash(cel,gi,31)*daGal.length)%daGal.length];
}
// tudo o que existe num pedaço de céu, gerado sempre igual a partir da célula
function celulaDe(lat,lon,q){ return [Math.floor(lon/q), Math.floor(lat/q)]; }
function lugarEm(lat,lon,q,gi){
  const [cx,cy]=celulaDe(lat,lon,q);
  const s0=(cx*73856093 ^ cy*19349663)>>>0;
  const r=k=>hash(cx,cy,s0+k);
  const tipo=pesado(TIPOS, fbm(cx*0.35,cy*0.35,101));
  const marco=marcoEm(lat,lon,gi);
  const nome = marco ? marco.n
    : PREFIXO[Math.floor(r(1)*PREFIXO.length)]+'-'+(100+Math.floor(r(2)*899))
      +(r(3)<0.3?' '+'abcdef'[Math.floor(r(4)*6)]:'');
  const habitavel = tipo.glifo==='sistema' || tipo.glifo==='planeta';
  const camadas = habitavel ? {
    quimica: QUIMICA[Math.floor(r(5)*QUIMICA.length)],
    civil:   CIVIL[Math.floor(Math.pow(r(6),1.9)*CIVIL.length)],
    tecno:   TECNO[Math.floor(Math.pow(r(7),2.4)*TECNO.length)],
    dim:     DIMENSAO[Math.floor(Math.pow(r(8),2.2)*DIMENSAO.length)],
    massa:   (0.2+r(9)*11).toFixed(2)+' massas terrestres',
    temp:    Math.round(-210+r(10)*680)+' °C'
  } : {
    dim: DIMENSAO[Math.floor(Math.pow(r(8),2.2)*DIMENSAO.length)],
    escala: Math.round(2+r(11)*400)+' anos-luz de extensão'
  };
  const notavel = (marco?4:0) + tipo.notavel
    + (camadas.civil && CIVIL.indexOf(camadas.civil)>4 ? 2:0)
    + (camadas.dim && camadas.dim!=='estável' ? 1:0);
  // âncora: o ponto exato do objeto dentro da célula, para haver o que acertar
  const ala=(cy+0.18+r(12)*0.64)*q, alo=(cx+0.18+r(13)*0.64)*q;
  return {cx,cy,q,tipo,nome,marco,camadas,notavel,
          ancora:{la:ala,lo:alo},
          chave: gi+':'+cx+':'+cy,
          proc: marco?'DC':'DS'};
}
// o que há por perto que valha a pena andar até lá
function varrerPerto(lat,lon,q,gi,alcance){
  const achados=[];
  for(let dy=-alcance;dy<=alcance;dy++){
    for(let dx=-alcance;dx<=alcance;dx++){
      if(!dx&&!dy) continue;
      const la=lat+dy*q, lo=lon+dx*q;
      const g2=galaxiaEm(la,lo);
      const l=lugarEm(la,lo,q,g2);
      if(l.notavel<3) continue;
      const met=distancia(lat,lon,l.ancora.la,l.ancora.lo);
      const rumo=Math.atan2(l.ancora.lo-lon, l.ancora.la-lat);
      achados.push({l,met,rumo,gal:g2,la:l.ancora.la,lo:l.ancora.lo});
    }
  }
  achados.sort((a,b)=>b.l.notavel-a.l.notavel || a.met-b.met);
  return achados.slice(0,3);
}
function versaoRegiao(lat,lon){
  const cel=Math.floor(lon/0.05)*13 ^ Math.floor(lat/0.05)*29;
  return 'r'+(1+Math.floor(hash(cel,0,17)*9))+'.'+Math.floor(hash(cel,1,23)*10);
}


const B32='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ESCALAS_Q=[0.0009,0.004,0.02,0.09,0.00018,0.45,2.0,9.0];
function codificar(la,lo,q){
  const latQ=Math.max(0,Math.min(33554431, Math.round((la+90)/180*33554431)));
  const lonQ=Math.max(0,Math.min(67108863, Math.round((lo+180)/360*67108863)));
  let ei=ESCALAS_Q.indexOf(q); if(ei<0) ei=0;
  // monta 54 bits em dois blocos, para não perder precisão em ponto flutuante
  const alto = latQ*8 + ei;                     // 28 bits
  const baixo = lonQ;                           // 26 bits
  let bits=[];
  for(let i=27;i>=0;i--) bits.push((alto>>>i)&1);
  for(let i=25;i>=0;i--) bits.push((baixo>>>i)&1);
  // verificação: soma dos grupos de 5
  let soma=0;
  for(let i=0;i<bits.length;i+=5){
    let v=0; for(let k=0;k<5;k++) v=(v<<1)|(bits[i+k]||0);
    soma=(soma+v)%32;
  }
  for(let i=4;i>=0;i--) bits.push((soma>>>i)&1);
  let txt='';
  for(let i=0;i<bits.length;i+=5){
    let v=0; for(let k=0;k<5;k++) v=(v<<1)|(bits[i+k]||0);
    txt+=B32[v];
  }
  return 'EXC-'+txt.slice(0,4)+'-'+txt.slice(4,8)+'-'+txt.slice(8,12);
}
function descodificar(cod){
  const limpo=String(cod||'').toUpperCase().replace(/^EXC-?/,'').replace(/[^0-9A-Z]/g,'')
    .replace(/I/g,'1').replace(/L/g,'1').replace(/O/g,'0').replace(/U/g,'V');
  if(limpo.length!==12) return null;
  let bits=[];
  for(const c of limpo){
    const v=B32.indexOf(c);
    if(v<0) return null;
    for(let i=4;i>=0;i--) bits.push((v>>>i)&1);
  }
  const corpo=bits.slice(0,54), verif=bits.slice(55,60);
  let soma=0;
  for(let i=0;i<54;i+=5){
    let v=0; for(let k=0;k<5;k++) v=(v<<1)|(corpo[i+k]||0);
    soma=(soma+v)%32;
  }
  let dado=0; for(let i=0;i<5;i++) dado=(dado<<1)|(bits[54+i]||0);
  if(dado!==soma) return null;                  // engano na cópia
  let alto=0; for(let i=0;i<28;i++) alto=alto*2+corpo[i];
  let baixo=0; for(let i=28;i<54;i++) baixo=baixo*2+corpo[i];
  const ei=alto%8, latQ=(alto-ei)/8;
  return {
    la: latQ/33554431*180-90,
    lo: baixo/67108863*360-180,
    q: ESCALAS_Q[ei]||ESCALAS_Q[0]
  };
}
function distancia(a1,o1,a2,o2){
  const R=6371000, r=Math.PI/180;
  const dl=(a2-a1)*r, dg=(o2-o1)*r;
  const s=Math.sin(dl/2)**2+Math.cos(a1*r)*Math.cos(a2*r)*Math.sin(dg/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(s)));
}
function coordDo(lugar){ return codificar(lugar.ancora.la, lugar.ancora.lo, lugar.q); }
function irParaCoord(cod){
  const d=descodificar(cod);
  if(!d){ nota('coordenada inválida — confira os doze símbolos'); return false; }
  if(modo==='fisica') escolherModo('estatica');
  irPara(d.la,d.lo,false);
  deriva+=120;
  const g2=galaxiaEm(d.la,d.lo), l=lugarEm(d.la,d.lo,d.q,g2);
  nota('chegou a '+l.nome+' · '+l.tipo.n+' · '+GAL[g2].n);
  return true;
}
async function copiarTexto(t,btn,ok){
  try{ await navigator.clipboard.writeText(t); }catch(e){
    const ta=document.createElement('textarea'); ta.value=t; document.body.appendChild(ta);
    ta.select(); try{document.execCommand('copy');}catch(_){} ta.remove();
  }
  if(btn){ const v=btn.textContent; btn.textContent=ok||'COPIADO';
    setTimeout(()=>btn.textContent=v,1500); }
}


raiz.NUCLEO = {
  GAL, TIPOS, MARCOS,
  hash, ruido, fbm,
  galaxiaEm, lugarEm, marcoEm, versaoRegiao,
  codificar, descodificar,
  // varre o globo à procura de exemplos de um tipo
  amostras(tipo, quantas, limite){
    const q=0.0009, achou=[];
    for(let i=0;i<(limite||60000) && achou.length<quantas;i++){
      const la=Math.asin(Math.random()*2-1)*180/Math.PI;
      const lo=Math.random()*360-180;
      const gi=galaxiaEm(la,lo);
      const l=lugarEm(la,lo,q,gi);
      if(l.tipo.n!==tipo) continue;
      achou.push({cod:codificar(l.ancora.la,l.ancora.lo,l.q), nome:l.nome,
                  gal:GAL[gi].n, tipo:l.tipo.n, valor:l.tipo.valor,
                  la:l.ancora.la, lo:l.ancora.lo});
    }
    return achou;
  },
  // o que existe numa coordenada
  lugarDe(cod){
    const d=descodificar(cod);
    if(!d) return null;
    const gi=galaxiaEm(d.la,d.lo);
    const l=lugarEm(d.la,d.lo,d.q,gi);
    return {cod, nome:l.nome, tipo:l.tipo.n, valor:l.tipo.valor, gal:GAL[gi].n,
            gi, la:d.la, lo:d.lo, q:d.q, marco:l.marco, camadas:l.camadas};
  }
};
})(typeof window!=='undefined'?window:globalThis);
