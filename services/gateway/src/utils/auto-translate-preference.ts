import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import {
  ApplicationPreferenceSchema,
  APPLICATION_PREFERENCE_DEFAULTS,
} from '@meeshy/shared/types/preferences';

/**
 * La préférence de traduction automatique d'un utilisateur — la SSOT du gateway.
 *
 * `User` n'a AUCUNE colonne `autoTranslateEnabled` : le seul store est le
 * document `UserPreferences.application`, écrit par `PATCH /me/preferences/application`
 * et validé par `ApplicationPreferenceSchema`. Quatre réponses d'authentification
 * (login, 2FA, refresh, magic link) servaient `true` en dur sous un TODO « Load
 * from UserPreferences.application » — sans jamais joindre la relation à leur
 * `select`, ce qui rendait la lecture impossible EN AVAL, silencieusement.
 *
 * D'où la forme du `select` et la lecture dans le MÊME module : un appelant qui
 * importe l'un trouve l'autre (même raison d'être que `recipient-language.ts`).
 *
 * **Et l'ÉCRITURE y vit pour la même raison (#3736).** `PATCH /users/me`
 * acceptait la clé — les deux schémas du corps, AJV et Zod, la DÉCLARENT — et
 * la jetait : son gestionnaire ne composait `updateData` que depuis des
 * colonnes de `User`, où celle-ci n'existe pas. Un site d'écriture qui aurait
 * dû redécouvrir seul « le magasin est le document `application`, et il faut
 * le FUSIONNER » est exactement le site qui écrase les vingt clés voisines.
 * Lecture, lecture directe et écriture partagent donc ce fichier.
 *
 * Un document absent, une clé absente ou une valeur d'un autre type rendent le
 * DÉFAUT du schéma partagé — jamais la valeur brute.
 */
export const AUTO_TRANSLATE_PREFERENCE_SELECT = {
  userPreferences: { select: { application: true } },
} as const;

/**
 * Le `select` de la LIGNE `UserPreferences` elle-même, quand on la lit sans
 * passer par la relation depuis `User` — le cas des porteurs qui tiennent déjà
 * leur compte en mémoire (cache d'auth) et n'ont que son identifiant.
 */
export const AUTO_TRANSLATE_PREFERENCE_DOCUMENT_SELECT = { application: true } as const;

export type AutoTranslatePreferenceSource = {
  readonly userPreferences?: { readonly application?: unknown } | null;
};

/** Le strict nécessaire du client Prisma — jamais l'instance entière. */
export type AutoTranslatePreferenceStore = Pick<PrismaClient, 'userPreferences'>;

const autoTranslatePreferenceShape = ApplicationPreferenceSchema.pick({ autoTranslateEnabled: true });

export function resolveAutoTranslateEnabled(
  user: AutoTranslatePreferenceSource | null | undefined
): boolean {
  const parsed = autoTranslatePreferenceShape.safeParse(user?.userPreferences?.application ?? {});
  return parsed.success
    ? parsed.data.autoTranslateEnabled
    : APPLICATION_PREFERENCE_DEFAULTS.autoTranslateEnabled;
}

/**
 * La préférence d'un compte dont on n'a que l'identifiant.
 *
 * Une ligne absente rend le défaut partagé, comme la relation absente ci-dessus :
 * les deux décrivent le même compte, celui qui n'a jamais rien réglé.
 */
export async function loadAutoTranslateEnabled(
  prisma: AutoTranslatePreferenceStore,
  userId: string
): Promise<boolean> {
  const row = await prisma.userPreferences.findUnique({
    where: { userId },
    select: AUTO_TRANSLATE_PREFERENCE_DOCUMENT_SELECT,
  });
  return resolveAutoTranslateEnabled({ userPreferences: row });
}

/**
 * Le document `application` avec cette seule clé changée — **les voisines
 * intactes**.
 *
 * `application` porte une vingtaine de clés (thème, police, animations,
 * accessibilité). Un `upsert` qui poserait `{ autoTranslateEnabled }` NU les
 * effacerait toutes, et le seul symptôme visible serait un thème qui se remet
 * à « auto » — un défaut qu'on n'attribue jamais à la route qui l'a causé.
 *
 * Un document qui n'est pas un objet (`null`, une valeur scalaire héritée) n'a
 * aucune voisine à préserver : il est REMPLACÉ.
 */
export function mergeAutoTranslatePreference(
  document: unknown,
  autoTranslateEnabled: boolean
): Prisma.InputJsonObject {
  const voisines: Prisma.JsonObject =
    typeof document === 'object' && document !== null && !Array.isArray(document)
      ? (document as Prisma.JsonObject)
      : {};
  return { ...voisines, autoTranslateEnabled };
}

/**
 * Écrit la préférence et rend ce que le magasin PORTE désormais — jamais la
 * valeur qu'on croit y avoir mise (elle est relue par le résolveur ci-dessus,
 * la seule loi de lecture du dépôt).
 *
 * `autoTranslateEnabled` n'est gardé par AUCUN consentement : la seule clé
 * consentie de la catégorie `application` est `telemetryEnabled`
 * (`ConsentValidationService.validateApplicationPreferences`), qu'aucun
 * appelant d'ici n'écrit. La DIFFUSION, elle, reste au site d'appel : elle a
 * besoin de l'instance Fastify, que ce module n'a pas — et ne doit pas avoir.
 *
 * Lire-fusionner-écrire n'est PAS atomique : deux écritures concurrentes sur
 * deux clés DIFFÉRENTES du même document peuvent en perdre une. Ce n'est pas
 * une classe nouvelle — les quatre verbes de `PATCH/PUT /me/preferences/{cat}`
 * ont exactement cette forme — et la refermer se ferait pour les sept
 * catégories à la fois, pas pour cette clé seule. Dit ici pour que le prochain
 * lecteur n'ait pas à l'instruire une seconde fois.
 */
export async function writeAutoTranslateEnabled(
  prisma: AutoTranslatePreferenceStore,
  userId: string,
  autoTranslateEnabled: boolean
): Promise<boolean> {
  const existante = await prisma.userPreferences.findUnique({
    where: { userId },
    select: AUTO_TRANSLATE_PREFERENCE_DOCUMENT_SELECT,
  });

  const application = mergeAutoTranslatePreference(existante?.application, autoTranslateEnabled);

  const row = await prisma.userPreferences.upsert({
    where: { userId },
    create: { userId, application },
    update: { application },
    select: AUTO_TRANSLATE_PREFERENCE_DOCUMENT_SELECT,
  });

  return resolveAutoTranslateEnabled({ userPreferences: row });
}
