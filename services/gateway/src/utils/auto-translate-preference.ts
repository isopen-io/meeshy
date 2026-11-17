import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { mergePreferenceKeysAtomically } from '../routes/me/preferences/preference-atomic-merge';
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
export type AutoTranslatePreferenceStore = Pick<PrismaClient, 'userPreferences' | '$runCommandRaw'>;

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
 * La clé se pose DANS la base, sur la valeur vivante (`mergePreferenceKeysAtomically`, #18910) : une bascule
 * voisine de `application` faite au même instant par `PATCH /me/preferences` ne se perd plus.
 */
export async function writeAutoTranslateEnabled(
  prisma: AutoTranslatePreferenceStore,
  userId: string,
  autoTranslateEnabled: boolean
): Promise<boolean> {
  const row = await mergePreferenceKeysAtomically(
    prisma, userId, 'application', { autoTranslateEnabled }, AUTO_TRANSLATE_PREFERENCE_DOCUMENT_SELECT);
  return resolveAutoTranslateEnabled({ userPreferences: { application: row.application } });
}
