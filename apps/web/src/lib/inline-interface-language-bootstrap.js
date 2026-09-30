// LA SEULE DÉFINITION du script d'amorçage synchrone de la langue d'INTERFACE
// (#6206) — DISTINCTE du Prisme de CONTENU (`resolveUserLanguage()`,
// `packages/shared/utils/conversation-helpers.ts`), qui résout la langue d'un
// MESSAGE pour son lecteur. Celle-ci résout la langue des libellés système :
// menus, annonces, `<html lang>`.
//
// MÊME PATRON QUE `inline-scheme-bootstrap.js` (#5588), pour la MÊME raison :
// ce script doit être lu par des lecteurs qui ne partagent pas le même
// runtime au moment où ils le lisent — `vite.config.ts` (le greffon qui
// l'injecte dans `index.html`, sous Node ou Bun) et `src/lib/interface-language.ts`
// (code applicatif, empaqueté par Vite/Rollup pour le navigateur). Un fichier
// `.js` sans syntaxe TypeScript s'importe à l'identique dans les deux.
//
// La clé ET la liste des langues supportées SONT le contrat : `interface-language.ts`
// importe `INTERFACE_LANGUAGE_KEY` et `SUPPORTED_INTERFACE_LANGUAGES` plutôt
// que de les recopier, donc le script inline et le module applicatif ne
// peuvent plus diverger.

export const INTERFACE_LANGUAGE_KEY = 'meeshy.interface-language';

/** Les sept langues du produit (CLAUDE.md racine, dimension 9), celles du
 * catalogue iOS — toutes cataloguées (`src/lib/interface-catalogs/`, #6206).
 * Une langue hors de cette liste résout vers `DEFAULT_INTERFACE_LANGUAGE`. Le
 * code est la LANGUE, jamais la région : `pt-BR` se sert en `pt`. */
export const SUPPORTED_INTERFACE_LANGUAGES = /** @type {const} */ (['fr', 'en', 'es', 'pt', 'de', 'it', 'ar']);

export const DEFAULT_INTERFACE_LANGUAGE = /** @type {const} */ ('fr');

/** Les langues d'interface qui se lisent de droite à gauche (#8803) — l'arabe,
 * seule des sept. Le script les lit pour poser `<html dir>` AVANT la première
 * peinture, comme `lang` : une page peinte à l'endroit puis retournée
 * sauterait sous les yeux du lecteur. */
export const RTL_INTERFACE_LANGUAGES = /** @type {const} */ (['ar']);

/**
 * @param {string} language une langue de `SUPPORTED_INTERFACE_LANGUAGES`
 * @returns {'rtl' | 'ltr'}
 */
export function interfaceDirection(language) {
  /** @type {readonly string[]} */
  const rtl = RTL_INTERFACE_LANGUAGES;
  return rtl.includes(language) ? 'rtl' : 'ltr';
}

/**
 * Le script bloquant : lit `INTERFACE_LANGUAGE_KEY` (un choix explicite déjà
 * posé par l'utilisateur) ; à défaut, prend la première langue de
 * `navigator.languages` qui figure dans `SUPPORTED_INTERFACE_LANGUAGES` ; sinon
 * retombe sur `DEFAULT_INTERFACE_LANGUAGE`. Ne lève jamais (mode privé,
 * stockage refusé — le `lang="fr"` statique du HTML reste alors, sans qu'aucun
 * consommateur ait à le savoir), et pose `document.documentElement.lang` AVANT
 * la première peinture — comme le schéma, une requête de plus le rendrait
 * inutile.
 */
export const INLINE_INTERFACE_LANGUAGE_BOOTSTRAP =
  `(function(){try{` +
  `var s=${JSON.stringify(SUPPORTED_INTERFACE_LANGUAGES)};` +
  `var c=localStorage.getItem('${INTERFACE_LANGUAGE_KEY}');` +
  `var r=(c&&s.indexOf(c)>=0)?c:null;` +
  `if(!r){` +
  `var ns=navigator.languages||[navigator.language];` +
  `for(var i=0;i<ns.length&&!r;i++){` +
  `var code=(ns[i]||'').slice(0,2).toLowerCase();` +
  `if(s.indexOf(code)>=0)r=code;` +
  `}` +
  `}` +
  `r=r||'${DEFAULT_INTERFACE_LANGUAGE}';` +
  `document.documentElement.lang=r;` +
  `document.documentElement.dir=${JSON.stringify(RTL_INTERFACE_LANGUAGES)}.indexOf(r)>=0?'rtl':'ltr';` +
  `}catch(e){}})();`;

/**
 * LA MÊME RÈGLE, EN FONCTION (#5563) — ce que « Automatique » résout quand les
 * réglages retirent un choix explicite, sans recharger la page. Elle vit ICI,
 * à côté du script, et `interface-language-choice.test.ts` exécute les deux sur
 * les mêmes cas : le premier écart entre la chaîne et la fonction rougit.
 *
 * @param {string | null} stored le choix stocké, ou `null`
 * @param {readonly string[]} languages `navigator.languages`, dans son ordre
 * @returns {string} une langue de `SUPPORTED_INTERFACE_LANGUAGES`
 */
export function resolveInterfaceLanguageCode(stored, languages) {
  /** @type {readonly string[]} */
  const supported = SUPPORTED_INTERFACE_LANGUAGES;
  if (stored && supported.includes(stored)) return stored;
  const found = languages
    .map((language) => (language || '').slice(0, 2).toLowerCase())
    .find((code) => supported.includes(code));
  return found ?? DEFAULT_INTERFACE_LANGUAGE;
}
