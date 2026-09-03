import type { ActifsTempsReel } from '@/lib/actifs-rt';

/**
 * CE QU'UN DOCUMENT DE PARTICIPATION PORTE POUR SON MODULE — et le chargeur
 * qui va le chercher.
 *
 * Le fil (`/chats/:cle`, `/chat/:lien`) et la liste (`/chats`) sont deux
 * surfaces de participation (§ 12.4) et deux modules différents ; le CHEMIN par
 * lequel leur module arrive est le même, et il vit ici depuis qu'il en a DEUX
 * lecteurs. Écrit deux fois, il aurait divergé au premier réglage — et c'est
 * précisément le réglage qui porte le gate : « aucune requête de script avant
 * le premier pixel ».
 *
 * `app/connecte/fil-vue.ts` réexporte les deux pour ses lecteurs historiques.
 */
export type TempsReel = {
  /** L'origine que le NAVIGATEUR peut joindre — jamais l'adresse interne du conteneur. */
  readonly passerelle: string;
  readonly actifs: ActifsTempsReel;
};

/**
 * Le chargeur différé (§ 12.4) : `load`, puis le PREMIER PIXEL, puis l'oisiveté,
 * et seulement alors `import()`.
 *
 * Le premier pixel est attendu par l'entrée `first-contentful-paint` de la
 * chronologie de performance — pas par deux `requestAnimationFrame`, qui
 * disent qu'un rendu a été PROGRAMMÉ, jamais qu'un pixel a été PRÉSENTÉ :
 * mesuré, le module partait à 90,1 ms pour un premier pixel daté 92 ms, une
 * fois sur seize, contre le gate « aucune requête de script avant le premier
 * pixel ». L'observateur ne rend la main qu'une fois l'entrée posée, donc
 * après l'instant qu'elle porte : l'ordre est opposable. Un navigateur qui
 * n'émet pas cette entrée retombe sur une minuterie de repli — le module
 * arrive plus tard, jamais avant le pixel.
 *
 * Il vise `main[data-module]`, pas une adresse écrite en dur : c'est le
 * document qui NOMME son module, et c'est ainsi qu'un même chargeur sert le fil
 * et la liste sans savoir lequel il charge.
 */
export const CHARGEUR_DE_PARTICIPATION =
  '<script type="module">' +
  'const m=document.querySelector("main[data-module]");' +
  'if(m){const u=m.dataset.module;let parti=false;' +
  'const l=()=>{if(parti)return;parti=true;import(u).catch(()=>{})};' +
  'const i=()=>{"requestIdleCallback"in window?requestIdleCallback(l,{timeout:1500}):setTimeout(l,1)};' +
  'const peint=()=>performance.getEntriesByName("first-contentful-paint").length>0;' +
  'const p=()=>{if(peint()){i();return}' +
  'try{new PerformanceObserver((e,o)=>{if(e.getEntriesByName("first-contentful-paint").length>0){o.disconnect();i()}}).observe({type:"paint",buffered:true})}catch{i()}' +
  'setTimeout(l,4000)};' +
  'document.readyState==="complete"?p():addEventListener("load",p,{once:true})}' +
  '</script>';
