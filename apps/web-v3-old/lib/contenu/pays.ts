import { getCountries, getCountryCallingCode } from 'libphonenumber-js';
import { SUPPORTED_LANGUAGES } from '@meeshy/shared/utils/languages';

import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { etiquettePreferee, langueDuVisiteur } from '@/lib/langue-du-visiteur';

/**
 * LES PAYS DU SÉLECTEUR D'INDICATIF — 245 lignes que PERSONNE N'ÉCRIT.
 *
 * Une table de pays écrite à la main est fausse le jour où elle est écrite :
 * un indicatif change, un pays naît, un nom français se corrige. Les trois
 * moitiés sont donc LUES, chacune à la seule source qui en réponde :
 *
 *   • les pays et leurs indicatifs, à `libphonenumber-js` — c'est la
 *     bibliothèque que la PASSERELLE emploie pour normaliser le numéro reçu
 *     (`services/gateway`), donc la seule liste dont un choix ici soit
 *     acceptable là-bas ;
 *   • le nom français, à `Intl.DisplayNames` — la table de la plateforme, sans
 *     une ligne à maintenir, comme `lib/contenu/langues.ts` le fait déjà pour
 *     les noms de langues ;
 *   • le drapeau, aux INDICATEURS RÉGIONAUX Unicode — deux lettres ISO
 *     décalées dans le bloc `U+1F1E6`, ce qui rend le drapeau de n'importe quel
 *     pays sans image ni sprite (0 octet servi, 0 requête).
 *
 * LE CALCUL SE FAIT UNE FOIS PAR PROCESSUS. Il traverse 245 pays, ouvre deux
 * `Intl` et trie — quelques millisecondes, mais sur le CHEMIN d'un rendu de
 * page. La v3 est rendue par le serveur : ce qui se calcule une fois par
 * processus ne se paie pas par lecteur, et rien de ce catalogue ne dépend de
 * la requête.
 *
 * IL NE VOYAGE JAMAIS VERS LE NAVIGATEUR. `libphonenumber-js` pèse plus que le
 * budget entier de l'écran (`apps/web-v3/budgets.json` : 0 Ko de JS de page) ;
 * ce module est SERVEUR, et ce qui arrive au lecteur est un `<select>` de
 * 245 `<option>` que le navigateur sait déjà rendre.
 */

export type Pays = {
  /** ISO 3166-1 alpha-2 — ce que la passerelle attend en `phoneCountryCode`. */
  readonly code: string;
  /** L'indicatif SANS son `+` — « 33 », « 234 ». */
  readonly indicatif: string;
  readonly nom: string;
  readonly drapeau: string;
  /** Ce que l'option AFFICHE — « 🇫🇷 +33 France ». */
  readonly libelle: string;
};

const PAYS_PAR_DEFAUT = 'FR';

const BASE_DES_INDICATEURS = 0x1f1e6;

const CODE_DE_A = 'A'.codePointAt(0) ?? 65;

/**
 * `FR` → 🇫🇷. Deux lettres latines majuscules décalées dans le bloc des
 * indicateurs régionaux : le système d'exploitation les rend en drapeau, et
 * les rend en deux lettres encadrées là où il n'en connaît pas — jamais en
 * carré vide.
 */
const drapeauDe = (code: string): string =>
  String.fromCodePoint(
    ...[...code].map((lettre) => BASE_DES_INDICATEURS + ((lettre.codePointAt(0) ?? CODE_DE_A) - CODE_DE_A)),
  );

const nomsDesPays = new Intl.DisplayNames([DOCUMENT_LANGUAGE], { type: 'region' });

const comparateur = new Intl.Collator(DOCUMENT_LANGUAGE);

const construis = (): readonly Pays[] =>
  getCountries()
    .map((code): Pays => {
      const indicatif = getCountryCallingCode(code);
      const nom = nomsDesPays.of(code) ?? code;
      const drapeau = drapeauDe(code);
      return { code, indicatif, nom, drapeau, libelle: `${drapeau} +${indicatif} ${nom}` };
    })
    .sort((a, b) => comparateur.compare(a.nom, b.nom));

let catalogue: readonly Pays[] | null = null;

export const catalogueDesPays = (): readonly Pays[] => (catalogue ??= construis());

/**
 * LA TABLE LANGUE → PAYS N'EN EST PAS UNE : c'est le DRAPEAU que
 * `SUPPORTED_LANGUAGES` donne déjà à chaque langue servie. `pt` porte 🇵🇹 —
 * donc PT, et non BR : le choix est celui de la table partagée, pas un
 * arbitrage refait ici, et le jour où le produit décide que le portugais du
 * Brésil est celui qu'il sert, un seul fichier change.
 *
 * Le décodage est l'inverse de `drapeauDe`. Une valeur qui n'est pas une paire
 * d'indicateurs régionaux — 🏴 du catalan, une séquence à étiquettes — ne rend
 * aucun pays plutôt qu'un pays faux.
 */
const paysDuDrapeau = (drapeau: string): string | null => {
  const points = [...drapeau].map((caractere) => caractere.codePointAt(0) ?? 0);
  if (points.length !== 2) return null;
  if (!points.every((point) => point >= BASE_DES_INDICATEURS && point <= BASE_DES_INDICATEURS + 25)) {
    return null;
  }
  return points.map((point) => String.fromCodePoint(point - BASE_DES_INDICATEURS + CODE_DE_A)).join('');
};

const paysDeLaLangue = (code: string): string | null => {
  const langue = SUPPORTED_LANGUAGES.find((servie) => servie.code === code);
  return langue === undefined ? null : paysDuDrapeau(langue.flag);
};

const connu = (code: string | null): code is string =>
  code !== null && (getCountries() as readonly string[]).includes(code);

/**
 * LA RÉGION D'ABORD, LA LANGUE ENSUITE, LA FRANCE À DÉFAUT.
 *
 * `fr-FR` dit la France ; `en-US` dit les États-Unis — c'est le renseignement
 * le plus PRÉCIS que l'en-tête porte, et il prime. Une étiquette sans région
 * (`pt`, `yo`) n'en porte pas : le pays vient alors du drapeau que la langue
 * porte dans `SUPPORTED_LANGUAGES`. Une région que personne ne numérote
 * (`es-419`, un code M.49 qui désigne l'Amérique latine et pas un pays) tombe
 * dans la même branche, et c'est voulu : mieux vaut l'Espagne qu'un `<select>`
 * ouvert sur l'Afghanistan.
 *
 * Le repli final est le pays du DOCUMENT, pas le premier de la liste triée —
 * la v3 est servie en français, et proposer l'Afrique du Sud à qui n'a rien
 * demandé serait un hasard alphabétique déguisé en choix.
 */
export const paysDuVisiteur = (acceptLanguage: string | null): string => {
  const region = /^[a-zA-Z]{2,3}(?:-[a-zA-Z]{4})?-([a-zA-Z]{2})(?:-|$)/.exec(
    etiquettePreferee(acceptLanguage) ?? '',
  )?.[1];
  const parLaRegion = region === undefined ? null : region.toUpperCase();
  if (connu(parLaRegion)) return parLaRegion;

  const parLaLangue = paysDeLaLangue(langueDuVisiteur(acceptLanguage));
  return connu(parLaLangue) ? parLaLangue : PAYS_PAR_DEFAUT;
};
