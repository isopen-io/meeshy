import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';

/**
 * La langue de CADRAGE d'un destinataire NOMMÉ — la SSOT du gateway.
 *
 * `NotificationService.resolveRecipientPrism` en porte l'énoncé : la langue de
 * cadrage est « le rang le plus haut RENSEIGNÉ », pas `systemLanguage`. Un rang 1
 * vide ne fait pas tomber au rang 2 tout seul : sans descente, il fait tomber au
 * REPLI, et le lecteur qui n'a renseigné que `regionalLanguage` (ou dont seule la
 * `deviceLocale` est connue, rang 4) reçoit ses e-mails dans une langue qu'il n'a
 * jamais demandée.
 *
 * Ce module existe parce que la descente demandait DEUX choses à ne pas rater, et
 * que rien ne les tenait ensemble :
 *
 *   select: { systemLanguage: true, regionalLanguage: true,
 *             customDestinationLanguage: true, deviceLocale: true }
 *   resolveUserLanguage(user, { deviceLocale: user.deviceLocale ?? undefined })
 *
 * Six sites recopiaient ce passe-plat, huit le sautaient. Et l'oubli le plus
 * coûteux est le `select` : une projection trop étroite rend la descente
 * impossible EN AVAL, silencieusement — le résolveur reçoit un objet dont les
 * rangs 2 à 4 sont `undefined` et rend un rang 1 parfaitement plausible. D'où la
 * forme du `select` et la descente dans le MÊME module : un appelant qui importe
 * l'un trouve l'autre.
 *
 * @see resolveUserLanguagesOrdered — la SSOT partagée dont ceci est le raccord.
 */
export const RECIPIENT_LANG_SELECT = {
  systemLanguage: true,
  regionalLanguage: true,
  customDestinationLanguage: true,
  deviceLocale: true,
} as const;

export type RecipientLanguagePrefs = {
  readonly systemLanguage?: string | null;
  readonly regionalLanguage?: string | null;
  readonly customDestinationLanguage?: string | null;
  readonly deviceLocale?: string | null;
};

/**
 * Les langues du lecteur, DANS L'ORDRE du Prisme et normalisées — la liste dans
 * laquelle un CONTENU se résout (`resolvePrismTranslation`). Vide quand le
 * lecteur est introuvable : un appelant ne doit pas pouvoir confondre « aucune
 * préférence » avec « une préférence par défaut ».
 */
export function recipientLanguages(
  user: RecipientLanguagePrefs | null | undefined
): readonly string[] {
  if (!user) return [];
  return resolveUserLanguagesOrdered(user, { deviceLocale: user.deviceLocale ?? undefined });
}

/**
 * La langue de CADRAGE : le premier rang renseigné, ou le repli du SITE.
 *
 * Le repli est un PARAMÈTRE, et c'est délibéré. `resolveUserLanguage` retombe
 * sur `'fr'` ; trois de ces sites retombent historiquement sur `'en'`. Trancher
 * la question — « quelle langue pour un compte sans AUCUNE préférence ? » — est
 * un arbitrage produit, pas un correctif de Prisme ; le mêler à la descente
 * rendrait les deux illisibles. Exiger le repli à l'appel le rend VISIBLE au
 * site plutôt que caché dans un défaut partagé.
 */
export function recipientLanguage(
  user: RecipientLanguagePrefs | null | undefined,
  fallback: string
): string {
  return recipientLanguages(user)[0] ?? fallback;
}

/**
 * L'étiquette de locale à donner à `Intl` / `toLocaleString`, dérivée de la
 * langue SERVIE.
 *
 * Un sous-tag de langue nu (`'de'`, `'es'`) EST une étiquette BCP-47 valide : il
 * n'y a pas de table `langue → locale` à tenir. Ce qu'il faut en revanche, c'est
 * un garde-fou, parce que les préférences sont persistées verbatim et que
 * `normalizeInAppLanguage` conserve tout sous-tag primaire alphabétique
 * plausible : un `'notalanguage'` de 12 lettres traverse la normalisation et fait
 * LEVER `Intl` (`RangeError`) au milieu d'un envoi d'e-mail. Une locale inconnue
 * d'ICU retombe donc sur le repli du site — visible — plutôt que sur la locale
 * par défaut du runtime, invisible.
 */
export function recipientDateLocale(
  user: RecipientLanguagePrefs | null | undefined,
  fallback: string
): string {
  const lang = recipientLanguage(user, fallback);
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([lang]).length > 0 ? lang : fallback;
  } catch {
    return fallback;
  }
}
