import type { Prisma } from '@meeshy/shared/prisma/client';
import { resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';

export type BroadcastTargeting = {
  readonly languages?: readonly string[];
  readonly countries?: readonly string[];
  readonly activityStatus?: 'active' | 'inactive' | 'all';
  readonly inactiveSinceDays?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const activityWindow = (targeting: BroadcastTargeting, now: Date): Prisma.UserWhereInput => {
  if (targeting.activityStatus === 'active') {
    return { lastActiveAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } };
  }
  if (targeting.activityStatus === 'inactive') {
    const days = targeting.inactiveSinceDays || 30;
    return { lastActiveAt: { lt: new Date(now.getTime() - days * DAY_MS) } };
  }
  return {};
};

/**
 * Le ciblage d'une diffusion admin, traduit en filtre Prisma — commun aux
 * canaux e-mail et in-app. Règle PURE : seul le ciblage entre, aucune
 * contrainte de canal (l'e-mail y ajoute l'adresse vérifiée, l'in-app n'exige
 * rien de plus qu'un compte actif).
 */
export function buildBroadcastRecipientFilter(
  targeting: BroadcastTargeting,
  now: Date = new Date(),
): Prisma.UserWhereInput {
  return {
    isActive: true,
    deletedAt: null,
    ...(targeting.languages && targeting.languages.length > 0
      ? { systemLanguage: { in: [...targeting.languages] } }
      : {}),
    ...(targeting.countries && targeting.countries.length > 0
      ? { registrationCountry: { in: [...targeting.countries] } }
      : {}),
    ...activityWindow(targeting, now),
  };
}

/**
 * Sujet/corps servis dans la langue du destinataire — la DESCENTE ORDONNÉE du
 * Prisme, jamais un rang unique.
 *
 * On parcourt les langues du lecteur DANS L'ORDRE (`preferredLanguages`, la
 * sortie de `recipientLanguages()`) ; la première qui porte une traduction
 * gagne. C'est la SSOT `resolvePrismTranslation` — celle que descend déjà la
 * bannière de notification —, pas une boucle réécrite ici (le `CLAUDE.md` du
 * gateway l'interdit : « NEVER reimplement the priority order locally »).
 *
 * `null` de la SSOT ⇒ servir l'ORIGINAL : soit la langue de tête EST la langue
 * source, soit aucun rang du lecteur n'a de traduction. Dans les deux cas
 * l'original (écrit en `sourceLanguage`) est le bon texte — JAMAIS une
 * traduction quelconque (règle #1 du Prisme).
 *
 * La langue de CADRAGE (chrome d'e-mail, `lang` de la notification) est un rôle
 * DISTINCT, résolu par `recipientLanguage(user, fallback)` : elle reste au rang
 * le plus haut RENSEIGNÉ même quand le contenu descend à un rang inférieur.
 */
export function localizedBroadcastText(params: {
  readonly translated: Readonly<Record<string, string>> | null | undefined;
  readonly sourceLanguage: string;
  readonly original: string;
  readonly preferredLanguages: readonly string[];
}): string {
  const resolved = resolvePrismTranslation({
    translations: params.translated ?? null,
    originalLanguage: params.sourceLanguage,
    preferredLanguages: params.preferredLanguages,
  });
  return resolved ? resolved.text : params.original;
}
