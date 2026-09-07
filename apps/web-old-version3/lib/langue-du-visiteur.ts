import { SUPPORTED_LANGUAGES } from '@meeshy/shared/utils/languages';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';

/**
 * CE QUE LA V3 SAIT D'UN VISITEUR QUI N'A ENCORE RIEN DIT — son en-tête
 * `Accept-Language`, et rien d'autre. C'est le rang 4 du Prisme (la locale de
 * l'appareil), et le seul indice dont dispose une page rendue par le serveur
 * avant la première interaction.
 *
 * CE MODULE A ÉTÉ REMONTÉ DEPUIS `app/(public)/chat/[lien]/langue.ts`, qui le
 * ré-exporte. Il y vivait parce que la modale d'un lien partagé fut la première
 * à pré-remplir une langue ; l'écran d'inscription est le second, et un parseur
 * d'en-tête recopié est un parseur qui divergera — le poids `q` d'un côté,
 * la première étiquette de l'autre.
 *
 * L'en-tête se lit COMME LE NAVIGATEUR L'ÉCRIT (RFC 9110 § 12.5.4) : chaque
 * étiquette porte un poids `q` (1 par défaut), et c'est le poids qui ordonne,
 * l'ordre d'écriture ne départageant que les ex æquo. `fr;q=0.5, en` dit « de
 * préférence l'anglais » — lire la première étiquette servait le français.
 * Une étiquette à `q=0` est un refus, et `*` n'est pas une langue.
 *
 * DEUX LECTURES, PAS UNE. `langueDuVisiteur` rend la LANGUE, normalisée
 * (`fr-FR` → `fr`) — c'est ce qu'un sélecteur de langue pré-remplit.
 * `etiquettePreferee` rend l'étiquette ENTIÈRE, région comprise, parce que la
 * région est précisément ce que la langue normalisée a jeté : `fr-FR` désigne
 * la France, et c'est de là que vient le pays proposé pour un numéro de
 * téléphone (`lib/contenu/pays.ts`). Normaliser d'abord et regretter ensuite
 * est ce qui obligerait à relire l'en-tête une seconde fois, avec un second
 * parseur.
 */

export type ChoixDeLangue = {
  readonly code: string;
  readonly nom: string;
};

const REPLI = 'fr';

const ETIQUETTE = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/;

const poidsDe = (parametres: readonly string[]): number => {
  const q = parametres.map((p) => /^\s*q\s*=\s*([0-9]*\.?[0-9]+)\s*$/i.exec(p)).find((m) => m !== null);
  if (q === undefined || q === null) return 1;
  const poids = Number(q[1]);
  return Number.isFinite(poids) ? poids : 0;
};

/** `fr-FR,fr;q=0.9,en;q=0.8` → `fr-FR` ; `fr;q=0.5, en` → `en` ; `*` → `null`. */
export const etiquettePreferee = (acceptLanguage: string | null): string | null => {
  const [preferee] = (acceptLanguage ?? '')
    .split(',')
    .map((partie, rang) => {
      const [brut = '', ...parametres] = partie.split(';');
      return { etiquette: brut.trim(), poids: poidsDe(parametres), rang };
    })
    .filter(({ etiquette, poids }) => ETIQUETTE.test(etiquette) && poids > 0)
    .sort((a, b) => b.poids - a.poids || a.rang - b.rang);
  return preferee?.etiquette ?? null;
};

/** `fr-FR,fr;q=0.9,en;q=0.8` → `fr` ; `fr;q=0.5, en` → `en` : le poids ordonne, l'écriture départage. */
export const langueDuVisiteur = (acceptLanguage: string | null): string => {
  const etiquette = etiquettePreferee(acceptLanguage);
  return etiquette === null ? REPLI : normalizeLanguageForDedup(etiquette);
};

const nomNatif = (code: string): string => {
  const info = SUPPORTED_LANGUAGES.find((langue) => langue.code === code);
  return info?.nativeName ?? info?.name ?? code;
};

/**
 * Les langues offertes, nommées DANS LEUR PROPRE LANGUE — « Français »,
 * « English », « Yorùbá ». C'est la seule convention qui marche dans un
 * sélecteur : on y cherche la sienne, et on ne la reconnaît pas sous son nom
 * français quand on ne lit pas le français. Le nom FRANÇAIS
 * (`lib/contenu/langues.ts`) sert l'autre besoin — nommer une langue DANS une
 * phrase française (« traduit de l'espagnol ») ; deux besoins, deux sites.
 *
 * Une liste vide vaut « toutes celles que Meeshy sert » : un lien partagé peut
 * restreindre les siennes, un écran d'inscription non.
 */
export const languesOffertes = (autorisees: readonly string[]): readonly ChoixDeLangue[] => {
  const codes = autorisees.length > 0 ? autorisees : SUPPORTED_LANGUAGES.map((langue) => langue.code);
  return codes.map((code) => ({ code, nom: nomNatif(code) }));
};
