import { kindOf } from './message';
import type { Delivery } from './message';
import { time } from '@/lib/grouping';
import type { Attachment, Message } from '@/lib/api/types';

/**
 * LE LIBELLÉ D'ACCESSIBILITÉ D'UN MESSAGE — SITE UNIQUE, partagé par la
 * rangée plate (Focal/Script) et la bulle : `routes/thread-modes.tsx` pose
 * `role="article"` + `aria-label` sur `[data-row]`, LA MÊME ancre pour les
 * deux peaux (#5774, travail 2/3). Avant ce module, l'`aria-label` posé là
 * valait `Message de ${sender}` — un lecteur d'écran annonçait l'auteur et
 * RIEN d'autre : ni le texte servi, ni une citation, ni un média, ni un
 * accusé, ni un badge.
 *
 * Port de `MessageAccessibilityLabelComposer.compose`
 * (`apps/ios/Meeshy/Features/Main/Focal/Preferences/MessageAccessibilityLabelComposer.swift:36-93`),
 * DANS L'ORDRE iOS : auteur (ou « Vous » pour un message à soi — le NOM est
 * alors ABSENT, pas remplacé) → citation → texte SERVI → pièces jointes
 * (images/vidéos/audios/fichiers) → heure → accusé de réception (SEULEMENT
 * sur un message à soi) → modifié → épinglé → éphémère → réactions.
 *
 * Chaque segment est OMIS quand il n'a rien à dire — jamais une virgule
 * flottante ni un « undefined » : un message texte simple sans historique
 * rend `"Bruno Bêta, Bonjour, 09:02"`, pas plus.
 */

const pluralize = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`;

/** Compte les pièces jointes PAR CATÉGORIE, dans l'ordre iOS : images, vidéos, audios, fichiers. */
function attachmentSegments(attachments: readonly Attachment[] | undefined): readonly string[] {
  if (attachments === undefined || attachments.length === 0) return [];
  const counts = { image: 0, video: 0, audio: 0, file: 0 };
  for (const attachment of attachments) counts[kindOf(attachment)] += 1;

  const segments: string[] = [];
  if (counts.image > 0) segments.push(pluralize(counts.image, 'image', 'images'));
  if (counts.video > 0) segments.push(pluralize(counts.video, 'vidéo', 'vidéos'));
  if (counts.audio > 0) segments.push(pluralize(counts.audio, 'audio', 'audios'));
  if (counts.file > 0) segments.push(pluralize(counts.file, 'fichier', 'fichiers'));
  return segments;
}

/** Le mot d'accusé, dans le vocabulaire déjà servi par le pied de rangée (`Check`, `message-blocks.tsx`). */
function deliveryWord(delivery: Delivery | null): string | undefined {
  switch (delivery) {
    case 'pending':
      return 'en cours d’envoi';
    case 'sent':
      return 'envoyé';
    case 'delivered':
      return 'distribué';
    case 'read':
      return 'lu';
    case null:
      return undefined;
  }
}

/** Les réactions, dans l'ordre stable de `Object.entries` — même vocabulaire que `reactionEntries`. */
function reactionsSegment(reactionSummary: Record<string, number> | undefined): string | undefined {
  if (reactionSummary === undefined) return undefined;
  const entries = Object.entries(reactionSummary).filter(([, count]) => count > 0);
  if (entries.length === 0) return undefined;
  return `réactions : ${entries.map(([emoji, count]) => `${emoji} ${count}`).join(', ')}`;
}

export type MessageLabelInput = {
  readonly message: Message;
  /** `isMineOf(message, viewerId)` — jamais recalculé ici (un seul site de la règle). */
  readonly isMine: boolean;
  /** Le texte SERVI par le Prisme (`served(...).text`), jamais `message.content` brut. */
  readonly servedText: string;
  /** `checkStatusOf(message, localDelivery)` — `null` hors accusé à peindre (message d'autrui, envoi échoué). */
  readonly delivery: Delivery | null;
};

/**
 * Compose le libellé complet d'une rangée de message — appelé UNE fois par
 * rangée montée (Focal, Script ou Bulles), jamais recalculé par sous-partie.
 */
export function composeMessageLabel({ message, isMine, servedText, delivery }: MessageLabelInput): string {
  const segments: string[] = [];

  const author = message.sender?.displayName;
  if (!isMine && author !== undefined && author !== '') segments.push(author);

  if (message.replyTo) {
    const quotedAuthor = message.replyTo.sender?.displayName ?? 'expéditeur inconnu';
    segments.push(`réponse à ${quotedAuthor}`);
  }

  if (servedText !== '') segments.push(servedText);

  segments.push(...attachmentSegments(message.attachments));

  segments.push(time(message.createdAt));

  if (isMine) {
    const word = deliveryWord(delivery);
    if (word !== undefined) segments.push(word);
  }

  if (message.isEdited) segments.push('modifié');
  if (message.pinnedAt !== undefined) segments.push('épinglé');
  if (message.expiresAt !== undefined) segments.push('éphémère');

  const reactions = reactionsSegment(message.reactionSummary);
  if (reactions !== undefined) segments.push(reactions);

  return segments.join(', ');
}
