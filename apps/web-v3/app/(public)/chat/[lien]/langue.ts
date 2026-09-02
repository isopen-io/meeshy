import { SUPPORTED_LANGUAGES } from '@meeshy/shared/utils/languages';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';

/**
 * LA LANGUE PRÉ-REMPLIE DE LA MODALE — depuis `Accept-Language`, jamais `'fr'`
 * en dur (critère de fin de `join` ; `apps/web/hooks/use-join-flow.ts:24,55`
 * la figeait). C'est le rang 4 du Prisme (la locale de l'appareil), et la seule
 * chose que le serveur sache d'un visiteur qui n'a encore rien dit.
 *
 * L'en-tête se lit COMME LE NAVIGATEUR L'ÉCRIT (RFC 9110 § 12.5.4) : chaque
 * étiquette porte un poids `q` (1 par défaut), et c'est le poids qui ordonne,
 * l'ordre d'écriture ne départageant que les ex æquo. `fr;q=0.5, en` dit « de
 * préférence l'anglais » — lire la première étiquette servait le français.
 * Une étiquette à `q=0` est un refus, et `*` n'est pas une langue.
 *
 * Un lien peut restreindre ses langues (`allowedLanguages`, servi par
 * l'aperçu) : la liste offerte est alors la sienne, et la langue du visiteur
 * n'y est pré-sélectionnée que si elle y figure — sinon la première autorisée.
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

/** `fr-FR,fr;q=0.9,en;q=0.8` → `fr` ; `fr;q=0.5,en` → `en` : le poids ordonne, l'écriture départage. */
export const langueDuVisiteur = (acceptLanguage: string | null): string => {
  const [preferee] = (acceptLanguage ?? '')
    .split(',')
    .map((partie, rang) => {
      const [brut = '', ...parametres] = partie.split(';');
      return { etiquette: brut.trim(), poids: poidsDe(parametres), rang };
    })
    .filter(({ etiquette, poids }) => ETIQUETTE.test(etiquette) && poids > 0)
    .sort((a, b) => b.poids - a.poids || a.rang - b.rang);
  return preferee === undefined ? REPLI : normalizeLanguageForDedup(preferee.etiquette);
};

const nomNatif = (code: string): string => {
  const info = SUPPORTED_LANGUAGES.find((langue) => langue.code === code);
  return info?.nativeName ?? info?.name ?? code;
};

export const languesOffertes = (autorisees: readonly string[]): readonly ChoixDeLangue[] => {
  const codes = autorisees.length > 0 ? autorisees : SUPPORTED_LANGUAGES.map((langue) => langue.code);
  return codes.map((code) => ({ code, nom: nomNatif(code) }));
};

export const langueProposee = (acceptLanguage: string | null, autorisees: readonly string[]): string => {
  const souhaitee = langueDuVisiteur(acceptLanguage);
  if (autorisees.length === 0 || autorisees.includes(souhaitee)) return souhaitee;
  return autorisees[0] ?? souhaitee;
};
