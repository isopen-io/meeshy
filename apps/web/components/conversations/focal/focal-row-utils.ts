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
import { resolveLastMessagePreview, resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';
import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import { startOfLocalDayMs } from '@meeshy/shared/utils/calendar-date';
import { isFirstInGroup as computeIsFirstInGroup } from '@/utils/message-grouping';

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
 * Le Prisme reste UNIQUE : une SEULE descente, `resolvePrismTranslation`
 * (`@meeshy/shared`), qui rend la PAIRE `{ language, text }` — précisément
 * l'API que la SSOT expose « pour les consommateurs qui doivent DIRE dans
 * quelle langue ils servent » (CLAUDE.md § « La descente elle-même est UNE
 * fonction »). `resolveLastMessagePreview` n'en est qu'une projection texte :
 * s'appuyer sur lui puis re-dériver la langue par une SECONDE boucle rouvrait
 * une divergence. C'est ce que faisait `focalServedLanguage`, qui rapprochait
 * les clés par `.toLowerCase()` : une clé région-taguée (`pt-BR`) ne matchait
 * jamais une préférence `pt`, et le libellé retombait sur la langue ORIGINALE
 * alors que le texte affiché était bien la traduction portugaise — la même
 * source (`normalizeLanguageForDedup`, région strippée) sert désormais le
 * texte ET son étiquette.
 *
 * `null` de `resolvePrismTranslation` ⇒ servir l'original : soit la langue
 * d'origine a gagné à son rang, soit aucune langue du lecteur n'est servie.
 * Dans les deux cas le fil affiche `message.content` étiqueté de sa langue
 * d'origine — « affiché en X, écrit en X », rien n'a été traduit.
 */
export function resolveFocalMessageDisplay(
  message: Pick<Message, 'content' | 'originalLanguage' | 'translations'>,
  preferredLanguages: readonly string[]
): { readonly text: string | null | undefined; readonly language: string | undefined } {
  const resolved = resolvePrismTranslation({
    translations: buildFocalTranslationsRecord(message.translations),
    originalLanguage: message.originalLanguage,
    preferredLanguages,
  });

  if (resolved) {
    return { text: resolved.text, language: resolved.language };
  }
  return { text: message.content, language: message.originalLanguage };
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

/**
 * Deux messages sont dans le même groupe visuel s'ils partagent l'expéditeur
 * (§WS-4 : « en tête de groupe uniquement ») ET le même jour calendaire — MAIS
 * un message SYSTÈME n'est jamais une prise de parole : il ouvre toujours son
 * propre groupe et ne continue jamais celui d'un voisin. L'avis d'arrivée est
 * écrit avec l'arrivant pour auteur (`packages/shared/utils/join-notice.ts`) ;
 * comparer les seuls `senderId` groupait la première vraie bulle du nouveau venu
 * avec l'annonce de sa propre arrivée — la bulle perdait alors avatar, nom et
 * horodatage ensemble (`FocalIdentityHeader` n'est monté qu'en tête de groupe).
 * Même défaut que la vue Bulles, corrigé le 2026-08-20 dans
 * `utils/message-grouping.ts` mais laissé dans ce mode de lecture Focal —
 * pourtant monté par `ConversationMessages`. La dimension JOUR y a rejoint la
 * règle le 2026-08-26 (it. 270) : sans elle, la première bulle sous une capsule
 * de date masquait son identité.
 *
 * La règle est déclarée UNE SEULE FOIS (`utils/message-grouping.ts`) : ce
 * prédicat n'en est qu'un adaptateur de forme (`senderId` plat → `sender.id`,
 * `createdAt` descendu tel quel), il ne recopie pas le raisonnement.
 */
export function isFirstInFocalGroup(
  current: Pick<Message, 'senderId' | 'messageSource' | 'createdAt'>,
  previous: Pick<Message, 'senderId' | 'messageSource' | 'createdAt'> | null | undefined
): boolean {
  return computeIsFirstInGroup(
    previous
      ? { sender: { id: previous.senderId }, messageSource: previous.messageSource, createdAt: previous.createdAt }
      : previous,
    { sender: { id: current.senderId }, messageSource: current.messageSource, createdAt: current.createdAt }
  );
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
