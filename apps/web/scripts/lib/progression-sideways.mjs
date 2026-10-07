/**
 * AUCUNE PAGE DE « PROGRESSION » NE GLISSE DE CÔTÉ (#9563, amendement n° 3) —
 * les adresses à mesurer et le relevé joué dans la page. Partagés par
 * `check-phone-frame.mjs` ; sortis ici pour que la liste des pages et la règle
 * se lisent à un seul endroit.
 *
 * LA RÈGLE EST PLUS DURE que celle du cadre général, qui tolère les BANDES (un
 * plateau fait pour glisser) : dans Progression, AUCUN conteneur ne défile de
 * côté, bande comprise, et rien ne DÉPASSE le conteneur qui défile — même coupé
 * par un verrou (`overflow-x: clip`). Un verrou cache un contenu rogné ; le
 * relevé nomme donc l'élément qui dépasse, pas seulement le défilement.
 */

export const PROGRESSION_CONCEPTS = ['level', 'points', 'meesh', 'glory', 'flame', 'missions', 'league', 'season', 'prestige', 'elans', 'badges', 'defis', 'succes', 'showcase', 'atlas'];

export const PROGRESSION_PAGES = [
  '/me/progression',
  ...PROGRESSION_CONCEPTS.map((concept) => `/me/progression/concept/${concept}`),
  '/me/progression/ligue',
  '/me/progression/saison',
  '/me/progression/vitrine',
  '/me/progression/atlas',
  '/me/progression/prestige',
  '/me/progression/badges',
  '/me/progression/defis',
  '/me/progression/succes',
  '/me/progression/regles',
  '/me/progression/carnet',
  '/me/progression/reglages',
];

/** Le drapeau des valeurs LONGUES (`src/lib/api/game-fixture-long.ts`) et la langue d'interface. */
export const GAME_LONG_FLAG = 'meeshy.fixtures.gameLong';
export const LANGUAGE_KEY = 'meeshy.interface-language';
/** Le niveau que la fixture longue sert : si la première page ne le dit pas, la mesure porte sur les valeurs confortables. */
export const LONG_LEVEL = '97';

/**
 * Les gabarits mesurés. 320 px dans les SEPT langues (le critère de l'issue) ;
 * 375 px dans les deux plus longues ; et 260 px en allemand — ce que devient une
 * page de 320 px quand le système agrandit le texte d'un quart : c'est là qu'un
 * mot insécable (« Missionsbelohnungen ») dépasse une colonne.
 */
export const PROGRESSION_GABARITS = [
  { viewport: { width: 320, height: 568 }, langues: ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] },
  { viewport: { width: 375, height: 667 }, langues: ['de', 'ar'] },
  { viewport: { width: 260, height: 568 }, langues: ['de'] },
];

/** Le relevé, joué DANS la page. */
export const sidewaysReleve = () => {
  const nom = (el) => {
    const id = el.id === '' ? '' : `#${el.id}`;
    const data = [...el.attributes].filter((a) => a.name.startsWith('data-')).slice(0, 2).map((a) => `[${a.name}${a.value === '' ? '' : `="${a.value}"`}]`).join('');
    const classes = [...el.classList].slice(0, 5).join('.');
    const texte = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${data}${classes === '' ? '' : `.${classes}`}${texte === '' ? '' : ` « ${texte} »`}`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && !el.classList.contains('sr-only');
  };
  const coupeX = (el) => /(hidden|clip|auto|scroll)/.test(getComputedStyle(el).overflowX);

  const main = document.getElementById('contenu');
  if (main === null) return { chemin: location.pathname + location.search, sansContenu: true };
  const cadre = main.getBoundingClientRect();

  /* 1. Aucun conteneur ne défile de côté, bande comprise. */
  const defilants = [...document.querySelectorAll('body *')]
    .filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1 && visible(el))
    .map((el) => `${nom(el)} défile de ${el.scrollWidth - el.clientWidth} px`);

  /* 2. Rien ne dépasse le conteneur qui défile. Un élément rogné par un ancêtre
        (texte tronqué, filigrane décoratif d'une carte) ne compte pas : c'est
        son ancêtre qui est jugé. */
  const rogneParUnAncetre = (el) => {
    for (let p = el.parentElement; p !== null && p !== main; p = p.parentElement) if (coupeX(p)) return true;
    return false;
  };
  const depasse = (el) => {
    const r = el.getBoundingClientRect();
    return r.right > cadre.right + 0.5 || r.left < cadre.left - 0.5;
  };
  const debords = [...main.querySelectorAll('*')]
    .filter((el) => visible(el) && depasse(el) && !rogneParUnAncetre(el) && (el.parentElement === main || !depasse(el.parentElement)))
    .slice(0, 4)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return `${nom(el)} (de ${Math.round(r.left)} à ${Math.round(r.right)} px dans un cadre de ${Math.round(cadre.left)} à ${Math.round(cadre.right)})`;
    });

  /* 3. Le verrou est posé sur le conteneur qui défile — et il ne CACHE rien :
        verrouillé, le conteneur garde dans `scrollWidth` la largeur de ce qu'il
        rogne (un mot insécable plus large que la page ne dépasse aucune boîte,
        seulement son texte). */
  const style = getComputedStyle(main);
  return {
    chemin: location.pathname + location.search,
    sansContenu: false,
    defilants,
    debords,
    rogne: main.scrollWidth - main.clientWidth,
    verrou: /(hidden|clip)/.test(style.overflowX),
    surdefilement: style.overscrollBehaviorX,
    elements: main.querySelectorAll('*').length,
    /* La garde de vacuité des valeurs longues : la carte du niveau, sur la première page. */
    niveau: document.querySelector('[data-concept-card="level"] [data-concept-value]')?.textContent ?? null,
  };
};
