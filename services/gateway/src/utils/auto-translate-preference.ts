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
 * Un document absent, une clé absente ou une valeur d'un autre type rendent le
 * DÉFAUT du schéma partagé — jamais la valeur brute.
 */
export const AUTO_TRANSLATE_PREFERENCE_SELECT = {
  userPreferences: { select: { application: true } },
} as const;

export type AutoTranslatePreferenceSource = {
  readonly userPreferences?: { readonly application?: unknown } | null;
};

const autoTranslatePreferenceShape = ApplicationPreferenceSchema.pick({ autoTranslateEnabled: true });

export function resolveAutoTranslateEnabled(
  user: AutoTranslatePreferenceSource | null | undefined
): boolean {
  const parsed = autoTranslatePreferenceShape.safeParse(user?.userPreferences?.application ?? {});
  return parsed.success
    ? parsed.data.autoTranslateEnabled
    : APPLICATION_PREFERENCE_DEFAULTS.autoTranslateEnabled;
}
