/**
 * Copie les pièces jointes d'un message SOURCE vers un message CIBLE en
 * réutilisant les MÊMES fichiers (`filePath`/`fileUrl` identiques) : aucun
 * octet n'est ré-envoyé, aucun fichier n'est dupliqué sur le disque.
 *
 * Ce n'est PAS un transfert : diffuser un média à plusieurs destinataires ne
 * doit laisser AUCUNE marque de provenance chez aucun d'eux — ni
 * `forwardedFromId` sur le message (le badge « Transféré depuis … »
 * révélerait à un groupe le nom de la conversation d'un autre destinataire),
 * ni `forwardedFromAttachmentId` / `isForwarded` sur les pièces jointes.
 * Chacun reçoit un message DE PLEIN DROIT.
 *
 * Reprend le corps de `MessageProcessor.copyForwardedAttachments` — mêmes
 * champs recopiés, chiffrement compris — avec trois différences :
 * 1. contrôle de propriété AVANT toute lecture d'attachment (seul l'auteur
 *    du message source peut faire copier ses pièces jointes) ;
 * 2. aucune marque de transfert écrite (ni `forwardedFromAttachmentId`, ni
 *    `isForwarded`) ;
 * 3. AUCUN `catch` silencieux — `copyForwardedAttachments` avale ses
 *    erreurs (best-effort, un forward dégénère en message ordinaire) ; ici
 *    une copie manquée fait échouer l'envoi plutôt que de laisser une bulle
 *    vide, irrécupérable, chez tous les destinataires de la diffusion.
 */

/**
 * Champs de la pièce jointe source lus pour construire la copie. Structural,
 * pas `PrismaClient` : le double de test reste trivial (même esprit que
 * `ForwardSourceReader` dans `AttachmentService.ts`).
 */
export interface SourceAttachment {
  readonly id: string;
  readonly fileName: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly filePath: string;
  readonly fileUrl: string;
  readonly title?: string | null;
  readonly alt?: string | null;
  readonly caption?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly thumbnailPath?: string | null;
  readonly thumbnailUrl?: string | null;
  readonly thumbHash?: string | null;
  readonly imageVariants?: unknown;
  readonly duration?: number | null;
  readonly bitrate?: number | null;
  readonly sampleRate?: number | null;
  readonly codec?: string | null;
  readonly channels?: number | null;
  readonly fps?: number | null;
  readonly videoCodec?: string | null;
  readonly pageCount?: number | null;
  readonly lineCount?: number | null;
  readonly transcription?: unknown;
  readonly translations?: unknown;
  readonly metadata?: unknown;
  readonly isEncrypted?: boolean;
  readonly encryptionMode?: string | null;
  readonly encryptionIv?: string | null;
  readonly encryptionAuthTag?: string | null;
  readonly encryptionHmac?: string | null;
  readonly originalFileHash?: string | null;
  readonly encryptedFileHash?: string | null;
  readonly originalFileSize?: number | null;
  readonly serverKeyId?: string | null;
  readonly thumbnailEncryptionIv?: string | null;
  readonly thumbnailEncryptionAuthTag?: string | null;
}

export interface CopyAttachmentsPrisma {
  message: {
    findUnique(args: {
      where: { id: string };
      select: { senderId: true };
    }): Promise<{ senderId: string } | null>;
  };
  messageAttachment: {
    findMany(args: { where: { messageId: string } }): Promise<readonly SourceAttachment[]>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

export interface CopyAttachmentsParams {
  readonly sourceMessageId: string;
  readonly targetMessageId: string;
  readonly requesterParticipantId: string;
}

export async function copyAttachmentsFromMessage(
  prisma: CopyAttachmentsPrisma,
  params: CopyAttachmentsParams
): Promise<{ copied: number }> {
  const source = await prisma.message.findUnique({
    where: { id: params.sourceMessageId },
    select: { senderId: true },
  });
  if (!source || source.senderId !== params.requesterParticipantId) {
    throw new Error('copy-attachments:not-owner');
  }

  const sourceAttachments = await prisma.messageAttachment.findMany({
    where: { messageId: params.sourceMessageId },
  });

  const created = await Promise.all(
    sourceAttachments.map((att) =>
      prisma.messageAttachment.create({
        data: {
          messageId: params.targetMessageId,
          fileName: att.fileName,
          originalName: att.originalName,
          mimeType: att.mimeType,
          fileSize: att.fileSize,
          filePath: att.filePath,
          fileUrl: att.fileUrl,
          title: att.title,
          alt: att.alt,
          caption: att.caption,
          width: att.width,
          height: att.height,
          thumbnailPath: att.thumbnailPath,
          thumbnailUrl: att.thumbnailUrl,
          duration: att.duration,
          bitrate: att.bitrate,
          sampleRate: att.sampleRate,
          codec: att.codec,
          channels: att.channels,
          fps: att.fps,
          videoCodec: att.videoCodec,
          pageCount: att.pageCount,
          lineCount: att.lineCount,
          uploadedBy: params.requesterParticipantId,
          isAnonymous: false,
          transcription: att.transcription ?? undefined,
          translations: att.translations ?? undefined,
          metadata: att.metadata ?? undefined,

          // Le placeholder instantané et les variantes WebP sont DÉJÀ dérivés
          // de ces octets-là — les laisser derrière condamnait la copie au
          // téléchargement pleine taille pour un travail déjà fait.
          thumbHash: att.thumbHash,
          imageVariants: att.imageVariants ?? undefined,

          // `filePath`/`fileUrl` repris à l'identique désignent le MÊME blob.
          // Quand l'original est chiffré, ce blob est du chiffré — la copie
          // doit porter les MÊMES champs de chiffrement, sans quoi elle
          // naîtrait avec le défaut Prisma `isEncrypted: false` et le client
          // rendrait le chiffré tel quel, croyant n'avoir rien à déchiffrer.
          isEncrypted: att.isEncrypted,
          encryptionMode: att.encryptionMode,
          encryptionIv: att.encryptionIv,
          encryptionAuthTag: att.encryptionAuthTag,
          encryptionHmac: att.encryptionHmac,
          originalFileHash: att.originalFileHash,
          encryptedFileHash: att.encryptedFileHash,
          originalFileSize: att.originalFileSize,
          serverKeyId: att.serverKeyId,
          thumbnailEncryptionIv: att.thumbnailEncryptionIv,
          thumbnailEncryptionAuthTag: att.thumbnailEncryptionAuthTag,
        },
      })
    )
  );

  return { copied: created.length };
}
