import { SUPPORTED_LANGUAGES } from '@meeshy/shared/utils/languages';

import { languesDemandees, type LangueDemandee } from '@/lib/a11y/langues-demandees';
import type { LienDadhesion } from '@/lib/api/adhesion';

/**
 * QUELLES LANGUES l'écran propose, et laquelle est pré-choisie.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DEUX QUESTIONS, ET LES CONFONDRE FERME UNE PORTE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le critère de fin demande que la langue soit « PRÉ-REMPLIE depuis
 * `Accept-Language` (et non `'fr'` en dur) ». C'est une question de DÉFAUT. La
 * première écriture y a répondu en faisant aussi de l'en-tête l'ENSEMBLE des
 * options — union de ce que le navigateur demande, de ce qu'on parle déjà dans
 * la conversation et de ce que le lien admet — ce qui est une tout autre
 * question, et une régression de capacité :
 *
 *   un locuteur yoruba sur un téléphone emprunté dont le navigateur envoie
 *   `en-US`, dans une conversation où l'on parle français et anglais, se voyait
 *   offrir « English, Français » et AUCUN yoruba.
 *
 * Il devait alors se déclarer dans une langue qu'il ne parle pas — et cette
 * valeur part dans `Participant.language`, qui alimente toutes les cibles de
 * traduction (`normalizeLanguageForDedup`, `MessageTranslationService`). Tout
 * le Prisme était faussé pour lui, durablement, sans aucun moyen de le corriger
 * depuis cet écran. Sur un lien neuf (aucun participant, aucun
 * `allowedLanguages`) et un navigateur monolingue, le `<select>` n'avait qu'UNE
 * option : un contrôle sans effet, ce que la loi 4 refuse. Et cela contredisait
 * la thèse que l'écran suivant écrit noir sur blanc — « Écrivez dans votre
 * langue : tout est traduit ».
 *
 * Les deux questions sont donc séparées :
 *
 *   • le DÉFAUT vient d'`Accept-Language` (rang 4 du Prisme), borné par
 *     `allowedLanguages` — pas la première langue DEMANDÉE, qui pourrait être
 *     justement celle que le lien refuse ;
 *   • l'ENSEMBLE vient des langues DU PRODUIT, borné par `allowedLanguages`
 *     quand l'hôte en impose, sans quoi l'écran offrirait un choix que la
 *     passerelle refuserait en 403.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENT LA TABLE, ET POURQUOI PAS D'ICI
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `SUPPORTED_LANGUAGES` (`@meeshy/shared`) est la source unique des langues du
 * produit — celle que la passerelle et le traducteur lisent. L'écrire ici en
 * ferait une SECONDE table, qui divergerait le jour où le produit gagne une
 * langue. Le paquet est donc DÉCLARÉ par le manifeste de la v3 et entre dans
 * son image (`Dockerfile`) : c'est le chemin que le § 2 de la conception
 * prescrit de toute façon pour le Zod partagé des formulaires, pris ici parce
 * que c'est ici qu'il devient nécessaire.
 *
 * Les NOMS, eux, ne viennent pas de la table : `languesDemandees` les dérive
 * d'`Intl.DisplayNames` dans la langue du document, comme pour toute autre
 * langue de l'écran — mesuré, les 83 langues du produit y sont toutes nommées.
 * Deux façons de nommer une langue seraient deux libellés pour la même ligne.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * L'ORDRE EST L'INFORMATION
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Ce que le visiteur cherche d'abord : sa préférence déclarée, puis ce qu'on
 * parle déjà dans la conversation, puis le reste du produit. Un `<select>` de
 * 83 lignes ordonné alphabétiquement ferait scroller un pouce sur 3G pour
 * retrouver ce que l'en-tête savait déjà.
 */

export type Proposition = {
  readonly langues: readonly LangueDemandee[];
  readonly choisie: string;
};

/**
 * Un code servi par la passerelle n'est décrit que s'il EST une étiquette de
 * langue. Le contraire ferait entrer la langue de repli sous le nom d'un code
 * illisible — une langue que personne n'a demandée, proposée à tout le monde.
 */
const decrite = (code: string): readonly LangueDemandee[] => {
  const [langue] = languesDemandees(code);
  return langue !== undefined && langue.code === code.trim().toLowerCase() ? [langue] : [];
};

/** Les langues du produit, décrites une fois — la table ne change pas d'une requête à l'autre. */
const LANGUES_DU_PRODUIT: readonly LangueDemandee[] = SUPPORTED_LANGUAGES.flatMap((langue) =>
  decrite(langue.code),
);

export const languesProposees = ({
  lien,
  acceptLanguage,
}: {
  readonly lien: Pick<LienDadhesion, 'languesDuLien' | 'languesParlees'>;
  readonly acceptLanguage: string | null;
}): Proposition => {
  const admise = (code: string): boolean =>
    lien.languesDuLien.length === 0 || lien.languesDuLien.includes(code);

  const demandees = languesDemandees(acceptLanguage);

  const langues = [
    ...demandees,
    ...lien.languesParlees.flatMap(decrite),
    ...lien.languesDuLien.flatMap(decrite),
    ...LANGUES_DU_PRODUIT,
  ]
    .filter((langue) => admise(langue.code))
    .filter((langue, index, toutes) => toutes.findIndex((autre) => autre.code === langue.code) === index);

  /**
   * Le repli du repli : un lien dont `allowedLanguages` ne porte AUCUNE
   * étiquette lisible ne laisse rien passer du tri ci-dessus. La langue
   * demandée reste alors la valeur du champ — la passerelle la refusera en
   * nommant sa raison (`LANGUAGE_NOT_ALLOWED`), ce que l'écran sait peindre,
   * plutôt qu'un `<select>` vide qui ne dit rien.
   */
  return { langues, choisie: langues[0]?.code ?? demandees[0]!.code };
};
