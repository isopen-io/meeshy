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
   * L'identifiant de la pièce, au premier niveau (#11264, audit S9) : le
   * décodeur Android natif (`AttachmentUpdatedEvent`) l'exige et rejetait
   * l'événement entier sans lui. Ajout pur : il redit `attachment.id`.
   */
  readonly attachmentId?: string;
  readonly attachment: unknown;
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
