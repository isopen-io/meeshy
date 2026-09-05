import { actifsTempsReel, type ActifsTempsReel } from '@/lib/actifs-rt';
import { listeDeCheminsDeZone } from '@/lib/sw/portees';

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
const scriptDifere = (charge: string): string =>
  '<script type="module">' +
  'let parti=false;' +
  `const l=()=>{if(parti)return;parti=true;${charge}};` +
  'const i=()=>{"requestIdleCallback"in window?requestIdleCallback(l,{timeout:1500}):setTimeout(l,1)};' +
  'const peint=()=>performance.getEntriesByName("first-contentful-paint").length>0;' +
  'const p=()=>{if(peint()){i();return}' +
  'try{new PerformanceObserver((e,o)=>{if(e.getEntriesByName("first-contentful-paint").length>0){o.disconnect();i()}}).observe({type:"paint",buffered:true})}catch{i()}' +
  'setTimeout(l,4000)};' +
  'document.readyState==="complete"?p():addEventListener("load",p,{once:true})' +
  '</script>';

export const CHARGEUR_DE_PARTICIPATION = scriptDifere(
  'const m=document.querySelector("main[data-module]");if(m)import(m.dataset.module).catch(()=>{})',
);

/**
 * LE CHARGEUR DU NAVIGATEUR DE ZONE (#5106) — même attente (premier pixel,
 * puis oisiveté), autre cible : le bloc `#zone-navigation` que
 * `documentPleinEcran` sert quand `V3_NAVIGABLE` déclare un périmètre. Il est
 * SÉPARÉ du chargeur de participation parce qu'il ne vit pas la même vie : un
 * écran sans module d'écran (la galerie, les réglages) a quand même droit à
 * la navigation douce.
 */
export const CHARGEUR_DU_NAVIGATEUR = scriptDifere(
  'const z=document.getElementById("zone-navigation");' +
    'if(z)try{import(JSON.parse(z.textContent).module).catch(()=>{})}catch{}',
);

/**
 * LES HUBS PRÉCHARGEABLES (#5104) — une liste FERMÉE d'adresses EXACTES, et
 * seulement des lectures sans effet de bord. `eagerness: "moderate"` : le
 * préchargement part au SURVOL, jamais d'office — l'économie 3G d'abord.
 *
 * JAMAIS `/chat/:lien` ni `/chats/:cle` (un GET y JOINT ou y ACCUSE — la
 * garde de provenance les 503 déjà sur `Sec-Purpose: prefetch`, ceci est la
 * défense en profondeur, pas la garde), et JAMAIS `prerender` : un prérendu
 * exécuterait le chargeur, donc les modules, donc leurs sockets — pour un
 * écran que personne ne regarde. La garde `speculation.test.ts` fige la
 * liste : une adresse à effet de bord qui y entrerait rougit.
 *
 * ET `/calls` N'Y ENTRE PAS, alors qu'il est un hub de l'espace membre comme
 * les sept ci-dessus et qu'il ne PORTE aucun effet de bord. La raison n'est
 * pas dans le document mais dans ce qu'il COÛTE au serveur : la seule route
 * qu'il demande, `GET /api/v1/calls/history`, est limitée à DIX appels par
 * minute et par lecteur (`RATE_LIMITS.CALL_OPERATIONS`,
 * `services/gateway/src/middleware/rate-limit.ts:56`) — la borne la plus
 * étroite qu'un écran connecté de cette zone attaque, d'un ordre de grandeur
 * sous les autres. Au SURVOL, dix passages de souris sur la rangée « Appels »
 * épuiseraient le quota du lecteur, et l'écran qu'il finirait par ouvrir
 * rendrait sa panne. Un préchargement doit être GRATUIT pour le serveur qu'il
 * sonde ; celui-ci ne l'est pas.
 */
export const HUBS_PRECHARGEABLES = [
  '/chats',
  '/feed',
  '/links',
  '/notifications',
  '/contacts',
  '/settings',
  '/search',
] as const;

export const REGLES_DE_SPECULATION =
  '<script type="speculationrules">' +
  JSON.stringify({ prefetch: [{ urls: [...HUBS_PRECHARGEABLES], eagerness: 'moderate' }] }) +
  '</script>';

/**
 * LA REGISTRATION DU TRAVAILLEUR DE ZONE (#4472) — une registration PAR
 * portée, jamais `scope: '/'` tant que l'étape 7 du § 4.9 n'est pas franchie.
 *
 * Les portées viennent de `lib/sw/portees.ts` (l'environnement du conteneur) ;
 * l'URL du script les transporte dans sa query — c'est ainsi qu'elles
 * atteignent le worker (`self.location`), et qu'un changement de portées
 * change l'URL, donc déclenche l'update. Sans portée : AUCUN script — pas un
 * script vide, rien.
 *
 * La registration attend `load` puis l'oisiveté : le téléchargement du script
 * du worker est une requête de script, et le gate « aucune requête de script
 * avant le premier pixel » la couvre. `catch` silencieux : un 404 (worker non
 * construit, déploiement sans env) laisse le document exactement ce qu'il est.
 *
 * AUCUN écouteur `controllerchange`, AUCUN `reload` : le battement
 * réenregistrement → activation → rechargement est précisément ce que #4472
 * interdit aux franchissements de frontière. Nos documents n'ont pas d'état
 * client à rejouer — un worker qui s'active les contrôlera à la navigation
 * suivante.
 */
export const SCRIPT_DU_TRAVAILLEUR = (portees: readonly string[]): string => {
  if (portees.length === 0) return '';
  const url = `/__v3/sw?portees=${encodeURIComponent(portees.join(','))}`;
  return (
    '<script>' +
    "if('serviceWorker' in navigator){addEventListener('load',()=>{" +
    `const l=()=>{for(const p of ${JSON.stringify(portees)})` +
    `navigator.serviceWorker.register(${JSON.stringify(url)},{scope:p,updateViaCache:'none'}).catch(()=>{})};` +
    "'requestIdleCallback'in window?requestIdleCallback(l,{timeout:3000}):setTimeout(l,1500)" +
    '},{once:true})}' +
    '</script>'
  );
};

/**
 * LE BLOC DU NAVIGATEUR DE ZONE (#5106) — servi quand le déploiement déclare
 * un périmètre navigable (`V3_NAVIGABLE`, même motif que les portées du
 * travailleur : l'image est unique, le périmètre appartient au compose).
 * Trois pièces, ensemble ou rien : le cadre (`#zone-navigation`, du JSON
 * inerte — la liste et l'adresse hashée du module), la région de statut que
 * le module remplit pour le lecteur d'écran, et le chargeur différé. Sans
 * l'artefact compilé, rien n'est servi : une adresse morte ne se compose pas.
 *
 * Il vit ICI parce qu'il a DEUX familles de consommateurs : les documents
 * PLEIN ÉCRAN (`documentPleinEcran`, qui le sert d'office) et les écrans
 * connectés composés par `documentDuSite` — la liste, le tableau de bord, le
 * fil du membre — qui le passent EXPLICITEMENT dans leur `script:`. La
 * vitrine et les écrans d'accès ne le servent pas : leurs liens sortent du
 * périmètre navigable, et 2 Ko de module pour aucun échange serait l'inverse
 * de l'économie du § 12.6.
 */
export const blocDuNavigateur = (): string => {
  const navigable = listeDeCheminsDeZone(process.env['V3_NAVIGABLE']);
  if (navigable.length === 0) return '';
  const actifDuNavigateur = actifsTempsReel().navigateur;
  if (actifDuNavigateur.corps === '') return '';
  return (
    `<script type="application/json" id="zone-navigation">${JSON.stringify({ navigable, module: actifDuNavigateur.url })}</script>` +
    '<p id="annonce-de-zone" role="status" class="hors-ecran"></p>' +
    CHARGEUR_DU_NAVIGATEUR
  );
};

