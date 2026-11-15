/**
 * Le domaine ATTACHMENT : progression du traitement et enrichissements
 * asynchrones d'une pièce jointe.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

/**
 * Données de mise à jour de statut d'attachement
 * Emitted by gateway when an attachment action occurs (e.g., download, view)
 */
export interface AttachmentStatusUpdatedEventData {
  readonly attachmentId: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly action: string;
  readonly updatedAt: Date;
  readonly playPositionMs?: number;
  readonly durationMs?: number;
  readonly percentage?: number;
  /**
   * L'écoute/le visionnage SERVI a-t-il atteint la fin — jamais le rapport
   * brut de CE message, mais la valeur collante tenue par
   * `MessageMediaConsumptionService` (#7359) : une fois vrai, reste vrai.
   * Absent pour les actions sans notion de progression (`viewed`,
   * `downloaded`).
   */
  readonly complete?: boolean;
}

/**
 * Payload de `SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED`.
 *
 * Reçu quand un worker gateway a enrichi un attachment d'un message
 * existant (transcription Whisper finalisée, traduction audio NLLB+TTS
 * finalisée pour une langue, etc.). `attachment` est la forme complète
 * sérialisée par `serializeAttachmentForSocket` côté gateway — incluant
 * `transcription` et `translations` enrichis. Le client remplace
 * l'attachment correspondant dans son store atomiquement.
 */
export interface AttachmentUpdatedEventData {
  readonly conversationId: string;
  readonly messageId: string;
  /**
   * L'identifiant de la pièce, au premier niveau (#11264, audit S9). Ajout pur :
   * il redit `attachment.id`, et les trois miroirs le déclarent OPTIONNEL — un
   * enrichissement qui porte sur le message entier n'en nomme aucune pièce.
   *
   * **La raison écrite ici jusqu'au 2026-11-14 nommait un consommateur qui n'existe
   * plus** : « le décodeur Android natif (`AttachmentUpdatedEvent`) l'exige et
   * rejetait l'événement entier sans lui ». Ce décodeur était le miroir PLAT, dont
   * aucun collecteur ne lisait le flux ; il est retiré (#18115), et l'exigence
   * qu'il portait avait déjà été levée par #18070. Le miroir Kotlin vivant est
   * `MessageAttachmentUpdatedEvent`, qui retombe sur `attachment.id`
   * (`servedAttachmentId`) — comme `AttachmentUpdatedEvent` côté Swift.
   */
  readonly attachmentId?: string;
  readonly attachment: unknown;
}

/**
 * Payload de `SERVER_EVENTS.ATTACHMENT_DELETED` (#13608) : une pièce a été retirée
 * d'un message, diffusée à la room de la conversation. Aucun contenu de la pièce.
 * Un ancien client ignore l'événement.
 */
export interface AttachmentDeletedEventData {
  readonly conversationId: string;
  readonly messageId: string;
  readonly attachmentId: string;
}

/**
 * Où en est le traitement d'un média sorti de la requête HTTP (#11264).
 * Absent sur une ligne héritée ou traitée pendant la requête : elle est prête.
 */
export type MediaProcessingState = 'pending' | 'ready' | 'failed';

/**
 * Payload de `SERVER_EVENTS.ATTACHMENT_READY` (#11264) : le worker de médias a
 * fini un rendu différé (vignette, variantes, rendu vidéo). Adressé à la room
 * personnelle de l'auteur de l'envoi — pièce de message OU média de post.
 * Les lecteurs d'une conversation reçoivent, eux, le `message:attachment-updated`
 * qu'ils savent déjà appliquer (un ancien client n'écoute pas celui-ci).
 */
export interface AttachmentReadyEventData {
  readonly attachmentId: string;
  readonly target: 'messageAttachment' | 'postMedia';
  readonly messageId: string | null;
  readonly conversationId: string | null;
  readonly processingState: MediaProcessingState;
  readonly attachment: unknown;
}
