import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import { undeliverableSeedEmails } from '../services/seed-accounts';

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
 * Les langues cibles NLLB d'une diffusion admin, CANONIQUES et dédupliquées.
 *
 * L'appelant fournit les `systemLanguage` d'un `groupBy` Prisma — persistés
 * VERBATIM (`z.string().optional()`, aucune normalisation à l'écriture), donc
 * région-tagués ou en casse mixte (`'fr-FR'`, `'FR'`, `'en-US'`, `'iw'`) selon la
 * plateforme émettrice. Laissées telles quelles, ces variantes :
 *   1. font stocker la traduction sous une clé non canonique (`translated['fr-FR']`)
 *      que la LIVRAISON (`recipientLanguages` → codes canoniques) ne retrouve
 *      jamais — le lecteur retombe sur l'original (violation Prisme règle #1) ;
 *   2. dédupliquent comme des langues DISTINCTES (`'fr'`/`'fr-FR'` = deux jobs ML) ;
 *   3. n'excluent pas la source quand elle-même est région-taguée.
 *
 * On canonicalise chaque code via la SSOT `normalizeLanguageForDedup` AVANT la
 * déduplication et l'exclusion de la source — même remède que
 * `PostService.audienceLanguages` (itération 287). L'ordre de première apparition
 * est préservé (déterminisme).
 */
export function broadcastTargetLanguages(
  rawLanguages: ReadonlyArray<string | null | undefined>,
  sourceLanguage: string,
): string[] {
  const source = normalizeLanguageForDedup(sourceLanguage);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of rawLanguages) {
    if (!raw) continue;
    const code = normalizeLanguageForDedup(raw);
    if (code === source || seen.has(code)) continue;
    seen.add(code);
    result.push(code);
  }
  return result;
}


/**
 * Les valeurs VERBATIM de `User.systemLanguage` qui replient sur l'un des
 * codes CANONIQUES demandés (#5161). `systemLanguage` est persisté tel quel —
 * `fr`, `fr-FR`, `FR`, `fr_FR` coexistent — donc un `{ in: ['fr'] }` cru sur le
 * code saisi dans l'UI admin rate toute variante région/casse. Une lecture
 * bornée par le nombre de valeurs DISTINCTES en base, jamais par le nombre
 * d'utilisateurs. Même SSOT que le rapport (`normalizeLanguageForDedup`,
 * #5146/#5155) : la liste rendue ici est ce qu'un ciblage doit réellement
 * atteindre.
 */
export async function resolveSystemLanguageVariants(
  prisma: Pick<PrismaClient, 'user'>,
  canonicalCodes: readonly string[],
): Promise<string[]> {
  const wanted = new Set(canonicalCodes.map(normalizeLanguageForDedup));
  const distinct = await prisma.user.findMany({
    distinct: ['systemLanguage'],
    where: { systemLanguage: { not: null } },
    select: { systemLanguage: true },
  });
  return distinct
    .map(d => d.systemLanguage)
    .filter((value): value is string => Boolean(value) && wanted.has(normalizeLanguageForDedup(value)));
}

/**
 * Le ciblage d'une diffusion admin, traduit en filtre Prisma — commun aux
 * canaux e-mail et in-app. Règle PURE sur tout SAUF la langue : seul le
 * ciblage entre, aucune contrainte de canal (l'e-mail y ajoute l'adresse
 * vérifiée, l'in-app n'exige rien de plus qu'un compte actif). La langue,
 * elle, a besoin d'une lecture (#5161, `resolveSystemLanguageVariants`
 * ci-dessus) — d'où l'`async`.
 */
export async function buildBroadcastRecipientFilter(
  prisma: Pick<PrismaClient, 'user'>,
  targeting: BroadcastTargeting,
  now: Date = new Date(),
): Promise<Prisma.UserWhereInput> {
  const languageVariants = targeting.languages && targeting.languages.length > 0
    ? await resolveSystemLanguageVariants(prisma, targeting.languages)
    : null;
  return {
    isActive: true,
    deletedAt: null,
    ...(languageVariants ? { systemLanguage: { in: languageVariants } } : {}),
    ...(targeting.countries && targeting.countries.length > 0
      ? { registrationCountry: { in: [...targeting.countries] } }
      : {}),
    ...activityWindow(targeting, now),
  };
}

/**
 * La contrainte du CANAL e-mail — ce que le CIBLAGE ne dit pas (#6581).
 *
 * Deux clauses, deux raisons OPPOSÉES, et c'est la seconde qui manquait :
 *
 *  · `emailVerifiedAt: { not: null }` — on n'écrit qu'à une adresse prouvée.
 *
 *  · `NOT` sur les trois adresses de bootstrap — on ne leur écrit JAMAIS.
 *    `InitService` pose leur `emailVerifiedAt` d'office
 *    PARCE QU'ELLES NE REÇOIVENT AUCUN COURRIER ; sans cette seconde clause, ce
 *    même champ déclare à l'envoyeur qu'elles en reçoivent. Le correctif de
 *    publication (#6581) les ferait donc entrer dans le ciblage de TOUTE
 *    diffusion, en REBONDS DURS garantis à chaque campagne — et un rebond dur
 *    se paie sur la réputation d'expéditeur, donc sur la délivrabilité de
 *    toutes les autres adresses.
 *
 * Un site UNIQUE pour les DEUX consommateurs du canal — le job d'envoi
 * (`BroadcastSenderJob`) et l'APERÇU admin (`POST /admin/broadcasts/:id/preview`).
 * Ils portaient la même clause dupliquée : un compte exclu d'un seul côté
 * ferait mentir le décompte annoncé à l'administrateur avant l'envoi.
 *
 * Le canal IN-APP n'en veut rien : une notification interne à un compte de
 * démonstration n'a ni boîte ni rebond. La contrainte est donc ici, et pas dans
 * `buildBroadcastRecipientFilter`, qui reste le ciblage PUR partagé.
 *
 * La comparaison est INSENSIBLE À LA CASSE — `User.email` est persisté VERBATIM
 * (le gateway ne le normalise qu'à la LECTURE, cf. `AuthService`), et la même
 * indifférence à la casse gouverne déjà `maySeedEmailVerification`. Les deux
 * moitiés de la règle doivent reconnaître la MÊME adresse : une ligne que le
 * boot vérifie d'office et que le filtre n'exclut pas est précisément le rebond
 * dur que ce lot évite.
 */
export function emailChannelRecipientConstraint(): Prisma.UserWhereInput {
  return {
    emailVerifiedAt: { not: null },
    NOT: undeliverableSeedEmails().map((email) => ({ email: { equals: email, mode: 'insensitive' as const } })),
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
