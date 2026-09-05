import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';

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
 * `User.systemLanguage` est persisté VERBATIM (région/casse variables selon le
 * client — `fr`, `fr-FR`, `FR`, `fr_FR` coexistent), alors que le ciblage
 * d'une diffusion admin se choisit parmi des codes CANONIQUES (`fr`, `en`, …,
 * cf. `LANGUAGES` de `apps/web/app/admin/broadcasts/new/page.tsx`). Un
 * `{ in: ['fr'] }` littéral contre cette colonne rate donc toute variante
 * région/casse. On élargit le filtre aux valeurs verbatim réellement
 * présentes en base dont le repli canonique matche l'un des codes demandés —
 * même SSOT `normalizeLanguageForDedup` que #5146/#5155 (qui repliait déjà
 * `usersByLanguage` de `/admin/languages/stats`), appliquée ici au FILTRE de
 * ciblage plutôt qu'au RAPPORT agrégé (#5161).
 */
export async function resolveSystemLanguageVariants(
  prisma: Pick<PrismaClient, 'user'>,
  canonicalLanguages: readonly string[],
): Promise<string[]> {
  if (canonicalLanguages.length === 0) return [];
  const wanted = new Set(canonicalLanguages.map((code) => normalizeLanguageForDedup(code)));
  const distinctValues = await prisma.user.findMany({
    where: { systemLanguage: { not: null } },
    distinct: ['systemLanguage'],
    select: { systemLanguage: true },
  });
  return distinctValues
    .map((u) => u.systemLanguage)
    .filter((value): value is string => Boolean(value) && wanted.has(normalizeLanguageForDedup(value)));
}

/**
 * Le ciblage d'une diffusion admin, traduit en filtre Prisma — commun aux
 * canaux e-mail et in-app. Règle PURE sur le ciblage lui-même (aucune
 * contrainte de canal : l'e-mail y ajoute l'adresse vérifiée, l'in-app n'exige
 * rien de plus qu'un compte actif) ; ASYNCHRONE parce que la langue exige une
 * lecture des valeurs verbatim en base ({@link resolveSystemLanguageVariants}).
 */
export async function buildBroadcastRecipientFilter(
  prisma: Pick<PrismaClient, 'user'>,
  targeting: BroadcastTargeting,
  now: Date = new Date(),
): Promise<Prisma.UserWhereInput> {
  const hasLanguages = Boolean(targeting.languages && targeting.languages.length > 0);
  const languageVariants = hasLanguages
    ? await resolveSystemLanguageVariants(prisma, targeting.languages as readonly string[])
    : [];
  return {
    isActive: true,
    deletedAt: null,
    ...(hasLanguages ? { systemLanguage: { in: languageVariants } } : {}),
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
