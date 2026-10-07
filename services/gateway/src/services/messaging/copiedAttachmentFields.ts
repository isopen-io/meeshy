/**
 * Les champs qu'une pièce jointe COPIÉE reprend de sa source — le site unique
 * du transfert (`MessageProcessor.copyForwardedAttachments`) et de la
 * diffusion (`copyAttachmentsFromMessage`), qui en tenaient chacun un
 * exemplaire recopié champ par champ.
 *
 * `filePath`/`fileUrl` repris à l'identique désignent le MÊME blob : la copie
 * doit donc dire de ses octets ce que la source en disait.
 *
 * - CHIFFREMENT — quand l'original est chiffré, ce blob est du chiffré. Le
 *   gateway sert les octets bruts et c'est le client qui déchiffre, d'après ce
 *   que la ligne déclare : une copie née avec le défaut `isEncrypted: false`
 *   ferait rendre le chiffré tel quel. `originalFileSize` compte au même
 *   titre, `fileSize` portant la taille CHIFFRÉE.
 * - PROTECTION (#9572) — `isViewOnce`, `isBlurred`, `effectFlags` de la PIÈCE,
 *   indépendants de ceux du message. Les laisser derrière faisait naître nette
 *   la copie d'une pièce floutée, et ordinaire celle d'une pièce à vue unique.
 * - `thumbHash` et `imageVariants` sont déjà dérivés de ces octets-là : les
 *   laisser condamnait la copie au téléchargement pleine taille.
 *
 * Ce que l'appelant ajoute : `messageId`, `uploadedBy`, et les marques de
 * transfert — la diffusion n'en pose aucune.
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
  readonly isViewOnce?: boolean;
  readonly isBlurred?: boolean;
  readonly effectFlags?: number;
}

/** Une colonne JSON garde le type de SA ligne : Prisma d'un côté, le double structurel de l'autre. */
type Json<A, K extends keyof A> = NonNullable<A[K]> | undefined;

export function copiedAttachmentFields<A extends SourceAttachment>(att: A) {
  return {
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
    isAnonymous: false,
    transcription: (att.transcription ?? undefined) as Json<A, 'transcription'>,
    translations: (att.translations ?? undefined) as Json<A, 'translations'>,
    metadata: (att.metadata ?? undefined) as Json<A, 'metadata'>,
    thumbHash: att.thumbHash,
    imageVariants: (att.imageVariants ?? undefined) as Json<A, 'imageVariants'>,
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
    isViewOnce: att.isViewOnce,
    isBlurred: att.isBlurred,
    effectFlags: att.effectFlags,
  };
}
