/**
 * Utilitaires PURS du rang Focal — WF-110/111/112.
 *
 * Prisme (WF-110) : `resolveFocalMessageText` est le SEUL point de
 * résolution linguistique de ce dossier — « Prisme par
 * `resolveLastMessagePreview` exclusivement » (mission WF-110). Aucune
 * seconde loi de langue n'est écrite ici : la fonction partagée
 * (`packages/shared/utils/conversation-helpers.ts`, déjà consommée par
 * `LentilleRow`/`LentilleBridgeLine`, WL-102) reçoit un texte + un
 * dictionnaire `{ langue: texte }` + la langue originale + les langues
 * préférées, et rend le texte à afficher. `buildFocalTranslationsRecord`
 * ADAPTE seulement la FORME : `Message.translations` est un TABLEAU
 * (`{ targetLanguage, translatedContent }[]`, `message-types.ts:30-34`),
 * quand `resolveLastMessagePreview` attend un DICTIONNAIRE — exactement la
 * même transformation de forme qu'utilise `LentilleBridgeLine` pour
 * `bridge.translations` (déjà un dictionnaire côté pont), transposée ici
 * pour la forme tableau du message.
 */
import type { Message, MessageTranslation } from '@meeshy/shared/types';
import { resolveLastMessagePreview } from '@meeshy/shared/utils/conversation-helpers';
import { conversationAccentPalette } from '@meeshy/shared/utils/conversation-colors';
import { startOfLocalDayMs } from '@meeshy/shared/utils/calendar-date';

/** Tableau `Message.translations` → dictionnaire `{ langue: texte }` attendu par `resolveLastMessagePreview`. */
export function buildFocalTranslationsRecord(
  translations: readonly MessageTranslation[] | undefined
): Readonly<Record<string, string>> | undefined {
  if (!translations || translations.length === 0) return undefined;
  const record: Record<string, string> = {};
  for (const translation of translations) {
    if (!translation.targetLanguage || !translation.translatedContent) continue;
    record[translation.targetLanguage] = translation.translatedContent;
  }
  return Object.keys(record).length > 0 ? record : undefined;
}

/**
 * Texte affiché d'un message du fil, résolu par le Prisme — MÊME loi que
 * la ligne de liste (`resolveLastMessagePreview`), aucune réimplémentation.
 */
export function resolveFocalMessageText(
  message: Pick<Message, 'content' | 'originalLanguage' | 'translations'>,
  preferredLanguages: readonly string[]
): string | null | undefined {
  return resolveLastMessagePreview({
    preview: message.content,
    translations: buildFocalTranslationsRecord(message.translations),
    originalLanguage: message.originalLanguage,
    preferredLanguages,
  });
}

/**
 * Accent déterministe d'un auteur cité (§3.6 `senderColorHex`, §3.11 quote
 * `colorFromAuthor`) — RÉUTILISE `conversationAccentPalette` (E3, LWS-2),
 * la SEULE loi de couleur déterministe déjà gelée côté web, appliquée au nom
 * d'affichage de l'auteur plutôt qu'au nom de la conversation. Aucun
 * utilitaire de couleur PAR UTILISATEUR n'existe ailleurs sur le web
 * (re-preuve : `grep -rn "getUserColor\|senderColorHex" apps/web` — aucun
 * résultat hors ce fichier) ; dériver la même palette d'un second nom
 * conserve le déterminisme sans introduire une seconde loi de couleur.
 */
export function resolveFocalAuthorAccent(displayName: string): string {
  return conversationAccentPalette({ name: displayName, type: 'direct' }).accent;
}

/** Deux messages sont dans le même groupe visuel s'ils partagent l'expéditeur (§WS-4 : « en tête de groupe uniquement »). */
export function isFirstInFocalGroup(
  current: Pick<Message, 'senderId'>,
  previous: Pick<Message, 'senderId'> | null | undefined
): boolean {
  if (!previous) return true;
  return previous.senderId !== current.senderId;
}

/**
 * Libellé « Mercredi · 17:42 » de la pilule jour·heure (WF-111, WS-2).
 * `Intl.DateTimeFormat` avec `weekday: 'long'` — capitalisé en première
 * lettre (même convention que `formatRelativeDate`'s `capitalizedDay`,
 * `utils/date-format.ts`), séparateur `·` repris du libellé produit
 * (« Mercredi · 17:42 », mission WF-111 — pas un point médian arbitraire).
 */
export function formatDayTimePillLabel(date: Date, locale: string): string {
  const dayName = date.toLocaleDateString(locale, { weekday: 'long' });
  const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return `${capitalizedDay} · ${time}`;
}

/** Libellé de la capsule date sticky (WF-112) — « Mercredi 12 août ». */
export function formatFocalDateCapsuleLabel(date: Date, locale: string): string {
  const label = date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Deux messages franchissent une frontière de jour calendaire LOCAL —
 * `startOfLocalDayMs` (`packages/shared/utils/calendar-date.ts`, DÉJÀ
 * consommé par `utils/date-format.ts`) plutôt qu'une comparaison de minuits
 * réimplémentée (même règle DST-safe que le reste du web).
 */
export function isNewCalendarDay(
  current: Date,
  previous: Date | null | undefined
): boolean {
  if (!previous) return true;
  return startOfLocalDayMs(current.getTime()) !== startOfLocalDayMs(previous.getTime());
}
