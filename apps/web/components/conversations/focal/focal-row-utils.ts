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
import type { Attachment } from '@meeshy/shared/types/attachment';
import type { CallSummaryMetadata } from '@meeshy/shared/utils/call-summary';
import { resolveLastMessagePreview } from '@meeshy/shared/utils/conversation-helpers';
import { colorForName } from '@meeshy/shared/utils/conversation-colors';
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
 * Le texte du fil AVEC la langue réellement servie — parité 2026-08-17.
 *
 * Le Prisme reste UNIQUE : `resolveLastMessagePreview` est appelé UNE fois,
 * ici, et son résultat est la seule source du texte affiché. La langue
 * servie n'est pas une SECONDE loi : elle est LUE du résultat de la première
 * (l'entrée du dictionnaire qui a gagné), jamais recalculée par une règle
 * parallèle. Sans elle, le fil ne pouvait pas dire « affiché en fr, écrit en
 * en » — l'information que la vue Bulles montre dans sa méta et que le fil
 * plat taisait.
 *
 * `language === originalLanguage` ⇒ rien n'a été traduit : c'est exactement
 * ce que `resolveLastMessagePreview` signifie en renvoyant `preview`.
 */
export function resolveFocalMessageDisplay(
  message: Pick<Message, 'content' | 'originalLanguage' | 'translations'>,
  preferredLanguages: readonly string[]
): { readonly text: string | null | undefined; readonly language: string | undefined } {
  const record = buildFocalTranslationsRecord(message.translations);
  const text = resolveLastMessagePreview({
    preview: message.content,
    translations: record,
    originalLanguage: message.originalLanguage,
    preferredLanguages,
  });

  if (!record || text == null || text === message.content) {
    return { text, language: message.originalLanguage };
  }

  const served = focalServedLanguage(record, preferredLanguages);
  return { text, language: served ?? message.originalLanguage };
}

/**
 * La langue RÉELLEMENT servie, LUE dans le MÊME ordre de priorité que
 * `resolveLastMessagePreview` (la première langue préférée présente dans le
 * dictionnaire) — jamais par correspondance de VALEUR. Deux traductions au
 * texte identique (ex. `pt`/`gl` = « Olá ») rendaient l'ancienne recherche par
 * valeur ambiguë : elle attribuait la langue de la PREMIÈRE entrée insérée dont
 * la valeur égalait le texte, et non celle que le Prisme a réellement servie.
 * Même filtrage que la loi partagée (chaîne non vide, minusculée) ; la casse du
 * `targetLanguage` d'origine est préservée dans la valeur rendue.
 */
function focalServedLanguage(
  record: Readonly<Record<string, string>>,
  preferredLanguages: readonly string[]
): string | undefined {
  const keyByLower = new Map<string, string>();
  for (const key of Object.keys(record)) keyByLower.set(key.toLowerCase(), key);
  for (const lang of preferredLanguages) {
    if (typeof lang !== 'string') continue;
    const normalized = lang.trim().toLowerCase();
    if (normalized === '') continue;
    const key = keyByLower.get(normalized);
    if (key !== undefined) return key;
  }
  return undefined;
}

/**
 * Le résumé d'appel — MÊME prédicat que la vue Bulles
 * (`components/common/BubbleMessage.tsx`, branche `callMetadata`) : un
 * message `messageSource: 'system'` dont `metadata.kind` vaut `call` ou
 * `call-live`. La vue Bulles court-circuite alors tout son rendu pour monter
 * `CallSystemMessage` ; le fil plat, lui, ne regardait PAS `metadata` du tout
 * et rendait donc une rangée vide (le `content` d'un résumé d'appel est
 * vide — l'information vit entièrement dans `metadata`).
 *
 * Le prédicat est ré-exprimé ici plutôt qu'importé parce qu'il n'existe nulle
 * part comme fonction : dans `BubbleMessage.tsx` il est INLINE. Le rendu, lui,
 * est RÉUTILISÉ tel quel (`CallSystemMessage`), jamais recopié.
 */
export function resolveFocalCallMetadata(
  message: Pick<Message, 'messageSource' | 'metadata'>
): CallSummaryMetadata | null {
  if (message.messageSource !== 'system') return null;
  const kind = (message.metadata as CallSummaryMetadata | undefined)?.kind;
  if (kind !== 'call' && kind !== 'call-live') return null;
  return message.metadata as CallSummaryMetadata;
}

/**
 * Sépare les pièces jointes IMAGE du reste — parité 2026-08-17.
 *
 * Les images gardent la grille NUE au radius 16 que le contrat Focal §WS-3
 * exige (`FocalMediaBlock`) ; tout le reste — vocal, audio, vidéo, PDF,
 * document, code, fichier — part vers le renderer de la vue Bulles
 * (`components/attachments/MessageAttachments`), RÉUTILISÉ VERBATIM. Avant
 * ce lot, « le reste » était simplement JETÉ : un vocal seul, une vidéo
 * seule, un PDF seul rendaient une rangée littéralement vide.
 */
export function splitFocalAttachments(
  attachments: readonly Attachment[] | undefined
): { readonly images: readonly Attachment[]; readonly others: readonly Attachment[] } {
  if (!attachments || attachments.length === 0) return { images: [], others: [] };
  const images: Attachment[] = [];
  const others: Attachment[] = [];
  for (const attachment of attachments) {
    (attachment.mimeType?.startsWith('image/') ? images : others).push(attachment);
  }
  return { images, others };
}

/**
 * Accent déterministe d'un auteur cité (§3.6 `senderColorHex`, §3.11 quote
 * `colorFromAuthor`) — une couleur d'IDENTITÉ, propre au nom de l'auteur, pour
 * le filet 2,5 pt « couleur de l'auteur cité » (contrat Focal §WS-3).
 *
 * `colorForName` (`conversation-colors.ts`) EST la SSOT de couleur par nom déjà
 * gelée côté partagé : hash DJB2 → 39 couleurs vibrantes, miroir exact de
 * `DynamicColorGenerator.colorForName` que l'iOS applique aux noms
 * d'expéditeur (`MessagePersistenceActor` → `colorForName(senderName)`).
 * `conversationAccentPalette` ne convient PAS ici : elle IGNORE son champ `name`
 * (calcul par type/langue/thème seuls, cf. `conversation-colors.ts`), donc,
 * dérivée d'un nom, elle rendait la MÊME couleur pour tous les auteurs — le
 * filet de citation était uniforme, contredisant « couleur de l'auteur cité ».
 */
export function resolveFocalAuthorAccent(displayName: string): string {
  return colorForName(displayName);
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
