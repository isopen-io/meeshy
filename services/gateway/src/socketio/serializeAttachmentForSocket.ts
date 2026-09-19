import {
  attachmentProtectionOf,
  type AttachmentProtectionField,
  type AttachmentProtectionFlags,
} from '@meeshy/shared/utils/attachment-protection';

/**
 * La forme que TOUT appelant de `serializeAttachmentForSocket` doit remettre
 * (#7028) — `Record<string, unknown>` PLUS les trois colonnes de protection,
 * requises et non nullables.
 *
 * Le grep de source qui gardait cet inventaire (`serialize-attachment-callers-
 * select.test.ts`) ne voyait que les fichiers qui IMPORTENT le sérialiseur —
 * `MessageProcessor.saveMessage` l'alimente sans l'importer (`message.attachments`
 * traverse `serializeMessageAttachmentsForSocket`), donc hors de sa portée.
 * Un CLIQUET DE TYPE, lui, couvre tout appelant, importateur ou non : le
 * paramètre exige les trois colonnes, et un `select` qui les omet ne compile
 * plus.
 */
export type SocketAttachmentRow = Record<string, unknown> &
  Required<Pick<AttachmentProtectionFlags, AttachmentProtectionField>>;

/**
 * Canonical serializer for a `MessageAttachment` over Socket.IO.
 *
 * The shape mirrors `attachmentMediaSelect` (cf.
 * `services/attachments/attachmentIncludes.ts`) — the render-ready set
 * that already includes the Prisme Linguistique JSON pair
 * (`transcription`, `translations`). Use this helper everywhere a
 * Message attachment is broadcast to clients so socket payloads stay
 * at parity with the REST `/messages` payload.
 *
 * The input is intentionally typed loosely (`Record<string, unknown>`)
 * because call sites may have queried Prisma with either
 * `attachments: true` (full row) or
 * `attachments: { select: attachmentMediaSelect }`. Both produce a
 * superset of the required fields ; we pick what we need and let
 * TypeScript infer the rest.
 *
 * Replaces scattered `(message as any).attachments` casts that silently
 * dropped `transcription` and `translations` depending on the query
 * path. See `docs/superpowers/specs/2026-05-25-audio-instant-render-and-attachment-size-design.md`.
 *
 * ## La PROTECTION voyage avec la pièce (#7014)
 *
 * Cette énumération manuelle a retenu, en silence, les trois champs dont
 * dépend `maskedAttachment` — la loi partagée qui décide si une pièce jointe
 * a le droit d'atteindre un DOM. Mesuré avant le lot, sur une ligne
 * `isViewOnce: true` : `maskedAttachment(ligne) === true`,
 * `maskedAttachment(servi) === false`. Une photo à VUE UNIQUE envoyée par
 * `message:send-with-attachments` rendait donc son `<img>` EN CLAIR chez ses
 * destinataires jusqu'au prochain `GET /messages` — la fuite que #6189 avait
 * fermée côté REST, rouverte par le canal socket.
 *
 * La correction n'est pas d'ajouter trois lignes à l'énumération, c'est de
 * cesser d'énumérer : `attachmentProtectionOf` PROJETTE la ligne sur
 * l'inventaire partagé (`ATTACHMENT_PROTECTION_FIELDS`) dont
 * `attachmentProtectionSelect` dérive aussi. Un quatrième canal de protection
 * s'ajoute à l'inventaire, et il traverse ce sérialiseur sans qu'une seule
 * ligne d'ici ne change. Un relais qui RECOPIE champ par champ est un
 * inventaire à tenir à jour, et il ne l'est jamais.
 *
 * Le `select` qui alimente ce sérialiseur est `attachmentSocketSelect`
 * (`services/attachments/attachmentIncludes.ts`) — jamais `attachmentMediaSelect`
 * nu, qui est délibérément SANS drapeau de protection.
 */
export interface SocketAttachment extends AttachmentProtectionFlags {
  readonly id: string;
  readonly messageId: string;
  readonly fileName?: string | null;
  readonly originalName?: string | null;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly fileUrl: string;
  readonly thumbnailUrl?: string | null;
  readonly thumbHash?: string | null;
  readonly imageVariants?: unknown;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly duration?: number | null;
  readonly bitrate?: number | null;
  readonly sampleRate?: number | null;
  readonly codec?: string | null;
  readonly channels?: number | null;
  readonly fps?: number | null;
  readonly videoCodec?: string | null;
  readonly pageCount?: number | null;
  readonly lineCount?: number | null;
  readonly metadata?: unknown;
  readonly uploadedBy?: string | null;
  readonly isAnonymous?: boolean | null;
  /**
   * Provenance : le média vient de la caméra / du micro de l'app. La feuille de
   * partage le lit pour décider si publier ce média demande confirmation
   * (`publicationNeedsCaptureConfirmation`). `attachmentMediaSelect` le charge à
   * DESSEIN (« la provenance voyage avec le média … Absent d'ici, la garde ne se
   * déclenche jamais ») ; l'omettre ICI désarmait la garde sur le chemin de
   * livraison WebSocket, exactement ce que le commentaire du select met en garde.
   * `boolean` non nullable, comme le contrat partagé
   * (`MessageAttachment.capturedInApp`, `Boolean @default(false)`).
   */
  readonly capturedInApp: boolean;
  readonly createdAt: Date | string;
  readonly transcription: unknown;
  readonly translations: unknown;
  /** BUG2 A' — réactions par-image agrégées (emoji→count). */
  readonly reactionSummary: Readonly<Record<string, number>>;
  /** BUG2 A' — emojis posés par le destinataire (vide si destinataire inconnu, ex broadcast). */
  readonly currentUserReactions: readonly string[];

  // ===========================================================================
  // #7070 — les familles qu'`attachmentSocketSelect` charge en plus de la
  // protection depuis ce lot : `message:new` / `message:edited` servaient
  // jusqu'ici la ligne BRUTE sur le chemin REST/ZMQ (65 colonnes, filePath et
  // enveloppe de chiffrement comprises) et cette forme curatée sur le chemin
  // socket — deux formes pour le MÊME événement. Voir le doc-comment
  // d'`attachmentSocketSelect` (`attachmentIncludes.ts`) pour la raison de
  // chaque famille, et pour celle qui reste HORS de cette forme (filePath,
  // encryptionIv, encryptionAuthTag — des secrets de SERVEUR qu'aucun client
  // ne lit pour déchiffrer).
  // ===========================================================================

  /** Provenance d'un transfert — DISTINCTE de `forwardedFromId` (au niveau MESSAGE). */
  readonly forwardedFromAttachmentId?: string | null;
  readonly isForwarded: boolean;
  /** Plafond de vue-unique PROPRE à la pièce (indépendant de celui du message). */
  readonly maxViewOnceCount?: number | null;
  readonly viewOnceCount: number;
  /** Horodatages et compteurs de consommation dénormalisés (bande de lecture). */
  readonly deliveredToAllAt?: Date | string | null;
  readonly viewedByAllAt?: Date | string | null;
  readonly downloadedByAllAt?: Date | string | null;
  readonly listenedByAllAt?: Date | string | null;
  readonly watchedByAllAt?: Date | string | null;
  readonly viewedCount: number;
  readonly downloadedCount: number;
  readonly consumedCount: number;
  /**
   * Le FAIT du chiffrement et son MODE — jamais l'enveloppe (`encryptionIv` /
   * `encryptionAuthTag` restent hors de cette forme, § doc-comment ci-dessus).
   */
  readonly isEncrypted: boolean;
  readonly encryptionMode?: string | null;
}

/**
 * BUG2 A' — agrège les rows `attachmentReactions` ({emoji, participantId}) en
 * `reactionSummary` (emoji→count) + `currentUserReactions` (emojis du participant
 * courant). `currentParticipantId` absent (broadcast) → currentUserReactions vide.
 */
export function aggregateAttachmentReactions(
  rows: ReadonlyArray<{ emoji: string; participantId: string }> | null | undefined,
  currentParticipantId?: string
): { reactionSummary: Record<string, number>; currentUserReactions: string[] } {
  const reactionSummary: Record<string, number> = {};
  const currentUserReactions: string[] = [];
  if (rows) {
    for (const r of rows) {
      reactionSummary[r.emoji] = (reactionSummary[r.emoji] ?? 0) + 1;
      if (currentParticipantId && r.participantId === currentParticipantId && !currentUserReactions.includes(r.emoji)) {
        currentUserReactions.push(r.emoji);
      }
    }
  }
  return { reactionSummary, currentUserReactions };
}

export function serializeAttachmentForSocket(
  raw: SocketAttachmentRow,
  currentParticipantId?: string
): SocketAttachment {
  const { reactionSummary, currentUserReactions } = aggregateAttachmentReactions(
    raw.reactions as ReadonlyArray<{ emoji: string; participantId: string }> | undefined,
    currentParticipantId
  );
  return {
    id: raw.id as string,
    messageId: raw.messageId as string,
    fileName: (raw.fileName as string | null | undefined) ?? null,
    originalName: (raw.originalName as string | null | undefined) ?? null,
    mimeType: raw.mimeType as string,
    fileSize: (raw.fileSize as number | undefined) ?? 0,
    fileUrl: raw.fileUrl as string,
    thumbnailUrl: (raw.thumbnailUrl as string | null | undefined) ?? null,
    thumbHash: (raw.thumbHash as string | null | undefined) ?? null,
    imageVariants: raw.imageVariants ?? null,
    width: (raw.width as number | null | undefined) ?? null,
    height: (raw.height as number | null | undefined) ?? null,
    duration: (raw.duration as number | null | undefined) ?? null,
    bitrate: (raw.bitrate as number | null | undefined) ?? null,
    sampleRate: (raw.sampleRate as number | null | undefined) ?? null,
    codec: (raw.codec as string | null | undefined) ?? null,
    channels: (raw.channels as number | null | undefined) ?? null,
    fps: (raw.fps as number | null | undefined) ?? null,
    videoCodec: (raw.videoCodec as string | null | undefined) ?? null,
    pageCount: (raw.pageCount as number | null | undefined) ?? null,
    lineCount: (raw.lineCount as number | null | undefined) ?? null,
    metadata: raw.metadata ?? null,
    uploadedBy: (raw.uploadedBy as string | null | undefined) ?? null,
    isAnonymous: (raw.isAnonymous as boolean | null | undefined) ?? null,
    // Provenance — voir `SocketAttachment.capturedInApp`. Le défaut `false`
    // reflète la valeur de colonne (`@default(false)`) pour un appelant qui
    // aurait requêté sans ce champ.
    capturedInApp: (raw.capturedInApp as boolean | null | undefined) ?? false,
    createdAt: raw.createdAt as Date | string,
    // Prisme Linguistique — null = pas encore enrichi, présent = serialize tel quel
    transcription: raw.transcription ?? null,
    translations: raw.translations ?? null,
    reactionSummary,
    currentUserReactions,
    // #7070 — les défauts reflètent les colonnes `@default(...)` du schéma
    // (`false` / `0`), jamais `undefined` : un appelant qui a chargé
    // `attachmentSocketSelect` reçoit toujours une valeur exploitable, un
    // appelant qui aurait chargé une forme plus étroite reçoit le même défaut
    // que la colonne elle-même.
    forwardedFromAttachmentId: (raw.forwardedFromAttachmentId as string | null | undefined) ?? null,
    isForwarded: (raw.isForwarded as boolean | null | undefined) ?? false,
    maxViewOnceCount: (raw.maxViewOnceCount as number | null | undefined) ?? null,
    viewOnceCount: (raw.viewOnceCount as number | null | undefined) ?? 0,
    deliveredToAllAt: (raw.deliveredToAllAt as Date | string | null | undefined) ?? null,
    viewedByAllAt: (raw.viewedByAllAt as Date | string | null | undefined) ?? null,
    downloadedByAllAt: (raw.downloadedByAllAt as Date | string | null | undefined) ?? null,
    listenedByAllAt: (raw.listenedByAllAt as Date | string | null | undefined) ?? null,
    watchedByAllAt: (raw.watchedByAllAt as Date | string | null | undefined) ?? null,
    viewedCount: (raw.viewedCount as number | null | undefined) ?? 0,
    downloadedCount: (raw.downloadedCount as number | null | undefined) ?? 0,
    consumedCount: (raw.consumedCount as number | null | undefined) ?? 0,
    isEncrypted: (raw.isEncrypted as boolean | null | undefined) ?? false,
    encryptionMode: (raw.encryptionMode as string | null | undefined) ?? null,
    // Protection — PROJETÉE depuis l'inventaire partagé, jamais recopiée
    // (voir l'en-tête du module). Répandue en DERNIER pour qu'aucune clé
    // ci-dessus ne puisse l'éclipser, et fail-CLOSED : une ligne dont la
    // requête n'a pas chargé ces colonnes sort MASQUÉE plutôt qu'ordinaire.
    ...attachmentProtectionOf(raw),
  };
}

/**
 * Normalise `message.attachments` — LA forme brute d'un `Message` (shared
 * `types/conversation.ts`), quel que soit le chemin qui l'a chargée — vers
 * `SocketAttachment[]`, l'UNIQUE forme émise sur `message:new` /
 * `message:edited` quel que soit le TRANSPORT (#7070).
 *
 * Avant ce lot, le producteur REST/ZMQ (`MeeshySocketIOManager`) posait
 * `attachments: message.attachments ?? []` — la ligne Prisma BRUTE — pendant
 * que le producteur socket (`MessageHandler`) tenait sa PROPRE boucle privée
 * (`_serializeAttachmentsField`), jumelle exacte de celle-ci. Les deux sites
 * appellent désormais cette fonction ; la boucle privée a été supprimée, sans
 * quoi « site unique » aurait été une phrase et non un fait — et c'est
 * précisément une boucle recopiée qui a laissé les deux transports diverger.
 *
 * Le paramètre est `unknown` parce que `Message.attachments` l'est sur le type
 * PUBLIC partagé : ce cast ÉRODE le cliquet de type de `SocketAttachmentRow`
 * (#7028), qui vit donc en AMONT, à la source du chargement
 * (`MessageProcessor.saveMessage`, affectation-fantôme). Un chemin qui ne
 * traverse pas cette source sérialise pièce par pièce sur le type Prisma exact
 * de son `select` — cf. `MessageHandler.handleMessageEdit` — plutôt que
 * d'appeler cette fonction.
 *
 * Un producteur qui la contourne pour revenir à un passthrough brut est
 * exactement la régression que `message-new-producer-parity.test.ts` détecte.
 */
export function serializeMessageAttachmentsForSocket(
  attachments: unknown,
  currentParticipantId?: string
): SocketAttachment[] {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((att) =>
    serializeAttachmentForSocket(att as SocketAttachmentRow, currentParticipantId)
  );
}
