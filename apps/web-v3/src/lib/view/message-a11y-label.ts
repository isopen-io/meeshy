import { kindOf } from './message';
import type { Delivery } from './message';
import { badgesOf } from './message-badges';
import { time } from '@/lib/grouping';
import type { ProtectionKind } from '@/lib/reading-mode/protection';
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
 * DANS L'ORDRE iOS : « Sans compte » (participant `anonymous`, jamais pour
 * soi — écart ASSUMÉ ajouté par la revue #5935, voir plus bas) → auteur (ou
 * « Vous » pour un message à soi — le NOM est alors ABSENT, pas remplacé) →
 * citation → texte SERVI → pièces jointes (images/vidéos/audios/fichiers) →
 * heure → accusé de réception (SEULEMENT sur un message à soi) → modifié →
 * épinglé → éphémère → réactions.
 *
 * Chaque segment est OMIS quand il n'a rien à dire — jamais une virgule
 * flottante ni un « undefined » : un message texte simple sans historique
 * rend `"Bruno Bêta, Bonjour, 09:02"`, pas plus.
 *
 * ET LA PROTECTION GOUVERNE CE LIBELLÉ (revue #5774). La première forme de ce
 * module composait `servedText` SANS regarder `protectionOf` : la rangée
 * peignait « Message supprimé » ou un contenu FLOUTÉ pendant que
 * `aria-label` annonçait le texte EN CLAIR à tout lecteur d'écran — mesuré
 * sur `/c/c-protection` : `aria-label="Amina Diallo, Le code du coffre est
 * 4817-2290., 10:14"`, et `check-thread-states.mjs` rouge sur ses quatre
 * assertions « nulle part dans le DOM — attributs compris ».
 *
 * C'est la leçon 275 du `CLAUDE.md` racine, rejouée sur une autre charge :
 * « une protection de CONTENU se mesure sur tout ce que la charge
 * TRANSPORTE ». Ici la charge est le NOM ACCESSIBLE, et ce qui partait à
 * côté du pixel gardé était le secret lui-même. La règle a donc UN site :
 * `composeMessageLabel` prend la PROTECTION et sert le même placeholder que
 * la surface, jamais le texte.
 */

/**
 * LE VOCABULAIRE DU PLACEHOLDER — celui que les surfaces PEIGNENT déjà
 * (`components/protected-content.tsx` : `ProtectionNotice` pour
 * supprimé/brûlé, `aria-label="Contenu masqué"` pour le voile) : un second
 * vocabulaire ferait dire deux choses différentes à l'œil et à l'oreille
 * pour un même état.
 */
const PROTECTED_LABEL: Readonly<Record<Exclude<ProtectionKind, 'standard'>, string>> = {
  deleted: 'Message supprimé',
  burned: 'Message vu et supprimé',
  expired: 'Message éphémère expiré',
  veiled: 'Contenu masqué',
};

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
  /**
   * `protectionOf(message, now)` — la MÊME loi que la surface consomme
   * (`lib/reading-mode/protection.ts`), jamais recalculée ici. OBLIGATOIRE :
   * un défaut à `'standard'` rendrait la fuite silencieuse au premier
   * appelant qui l'oublie.
   */
  readonly protection: ProtectionKind;
};

/**
 * Compose le libellé complet d'une rangée de message — appelé UNE fois par
 * rangée montée (Focal, Script ou Bulles), jamais recalculé par sous-partie.
 */
export function composeMessageLabel({ message, isMine, servedText, delivery, protection }: MessageLabelInput): string {
  /**
   * TROIS ÉTATS NE PEIGNENT AUCUN CHROME — un tombstone plat, ou rien du
   * tout (`focal-row.tsx:192` rend un nœud VIDE pour l'expiré). Leur libellé
   * est le tombstone SEUL : ni auteur, ni heure, ni pièce jointe — rien de ce
   * que la rangée ne montre pas.
   */
  if (protection === 'deleted' || protection === 'burned' || protection === 'expired') {
    return PROTECTED_LABEL[protection];
  }

  const segments: string[] = [];

  /**
   * « SANS COMPTE » ENTRE DANS LE LIBELLÉ (revue #5935, défauts 1/4) — un
   * écart ASSUMÉ avec iOS, documenté en D-32. `FocalIdentityHeader.swift`
   * pose le fantôme `theatermasks.fill` comme un NŒUD SÉPARÉ, absorbé sans
   * reste par `.accessibilityElement(children: .combine)` — sur iOS le
   * marqueur est donc PRONONCÉ, lui aussi, juste avant le nom. Le web pose
   * la même information en `aria-label` du glyphe (`GlyphSvg`,
   * `focal-row.tsx`) ; masquer tout `[data-identity]` pour éviter la
   * double lecture (voir `thread-modes.tsx`) le ferait taire. Le composer
   * ICI, dans le même ordre visuel (avant le nom), tient donc la parité que
   * l'iconographie seule ne suffit plus à porter.
   */
  const isAnonymous = !isMine && message.sender?.type === 'anonymous';
  if (isAnonymous) segments.push('Sans compte');

  const author = message.sender?.displayName;
  if (!isMine && author !== undefined && author !== '') segments.push(author);

  if (message.replyTo) {
    const quotedAuthor = message.replyTo.sender?.displayName ?? 'expéditeur inconnu';
    segments.push(`réponse à ${quotedAuthor}`);
  }

  /**
   * LE VOILE remplace le TEXTE **et** l'inventaire des pièces jointes : « 1
   * image » sur un message à vue unique dit déjà ce que le flou cache.
   */
  if (protection === 'veiled') {
    segments.push(PROTECTED_LABEL.veiled);
  } else {
    if (servedText !== '') segments.push(servedText);
    segments.push(...attachmentSegments(message.attachments));
  }

  segments.push(time(message.createdAt));

  if (isMine) {
    const word = deliveryWord(delivery);
    if (word !== undefined) segments.push(word);
  }

  if (message.isEdited) segments.push('modifié');
  /**
   * TRANSFÉRÉ — segment absent avant #5936 (constat D-31 : « composeMessageLabel
   * n'a AUCUN segment "transféré" »). `badgesOf` (site UNIQUE,
   * `message-badges.ts`) tranche le libellé — jamais recalculé ici. Le
   * libellé est mis en bas de casse pour rejoindre les autres segments d'état
   * (« modifié », « épinglé »), qui ne portent jamais de majuscule au milieu
   * de la phrase composée.
   */
  const forwardedBadge = badgesOf(message).find((badge) => badge.kind === 'forwarded');
  if (forwardedBadge !== undefined) {
    segments.push(forwardedBadge.label.charAt(0).toLowerCase() + forwardedBadge.label.slice(1));
  }
  if (message.pinnedAt !== undefined) segments.push('épinglé');
  if (message.expiresAt !== undefined) segments.push('éphémère');

  const reactions = reactionsSegment(message.reactionSummary);
  if (reactions !== undefined) segments.push(reactions);

  return segments.join(', ');
}
