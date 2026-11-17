package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** A user detail attached to a reaction — port of ReactionUserDetail (CoreModels.swift). */
@Serializable
data class ReactionUserDetail(
    val userId: String,
    val username: String = "",
    val avatar: String? = null,
    val createdAt: String? = null,
)

/** A group of reactions for a single emoji — port of ReactionGroup (CoreModels.swift). */
@Serializable
data class ReactionGroup(
    val emoji: String,
    val count: Int = 0,
    val users: List<ReactionUserDetail> = emptyList(),
)

/** Reaction sync response for a message — port of ReactionSyncResponse (CoreModels.swift). */
@Serializable
data class ReactionSyncResponse(
    val messageId: String,
    val reactions: List<ReactionGroup> = emptyList(),
    val totalCount: Int = 0,
    val userReactions: List<String> = emptyList(),
)

/** A forward reference on a message — port of ForwardReference (CoreModels.swift). */
@Serializable
data class ForwardReference(
    val originalMessageId: String = "",
    val senderName: String = "",
    val senderAvatar: String? = null,
    val previewText: String = "",
    val conversationId: String? = null,
    val conversationName: String? = null,
    val attachmentType: String? = null,
    val attachmentThumbnailUrl: String? = null,
    /**
     * Type of the SOURCE conversation (`direct`, `group`, `public`, `global`,
     * `community`, `channel`, `bot`, `broadcast`) — same values as a
     * conversation's `type`. Optional: cache rows older than the field decode to
     * `null` with no migration.
     */
    val conversationType: String? = null,
)

/** Embedded transcription segment in an attachment — port of EmbeddedTranscription.TranscriptionSegmentData (CoreModels.swift). */
@Serializable
data class TranscriptionSegmentData(
    val text: String = "",
    val startTime: Double? = null,
    val endTime: Double? = null,
    val speakerId: String? = null,
)

/** Lightweight transcription embedded in an attachment — port of EmbeddedTranscription (CoreModels.swift). */
@Serializable
data class EmbeddedTranscription(
    val text: String = "",
    val language: String = "",
    val confidence: Double? = null,
    val durationMs: Int? = null,
    val speakerCount: Int? = null,
    val segments: List<TranscriptionSegmentData>? = null,
)

/** Lightweight audio translation embedded in an attachment — port of EmbeddedAudioTranslation (CoreModels.swift). */
@Serializable
data class EmbeddedAudioTranslation(
    val url: String = "",
    val transcription: String? = null,
    val durationMs: Int? = null,
    val format: String? = null,
    val cloned: Boolean? = null,
    val quality: Double? = null,
    val voiceModelId: String? = null,
    val ttsModel: String? = null,
    val segments: List<TranscriptionSegmentData>? = null,
)

/** A message attachment — port of MeeshyMessageAttachment (CoreModels.swift). */
@Serializable
data class MeeshyMessageAttachment(
    val id: String,
    val messageId: String? = null,
    val fileName: String = "",
    val originalName: String = "",
    val mimeType: String = "application/octet-stream",
    val fileSize: Int = 0,
    val filePath: String = "",
    val fileUrl: String = "",
    val title: String? = null,
    val alt: String? = null,
    val caption: String? = null,
    val forwardedFromAttachmentId: String? = null,
    val isForwarded: Boolean = false,
    val isViewOnce: Boolean = false,
    val maxViewOnceCount: Int? = null,
    val viewOnceCount: Int = 0,
    val isBlurred: Boolean = false,
    val width: Int? = null,
    val height: Int? = null,
    val thumbnailPath: String? = null,
    val thumbnailUrl: String? = null,
    val thumbHash: String? = null,
    val duration: Int? = null,
    val bitrate: Int? = null,
    val sampleRate: Int? = null,
    val codec: String? = null,
    val channels: Int? = null,
    val fps: Float? = null,
    val videoCodec: String? = null,
    val pageCount: Int? = null,
    val lineCount: Int? = null,
    val uploadedBy: String = "",
    val isAnonymous: Boolean = false,
    val createdAt: String? = null,
    val isEncrypted: Boolean = false,
    val encryptionMode: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val thumbnailColor: String = "4ECDC4",
    val transcription: EmbeddedTranscription? = null,
    val audioTranslations: Map<String, EmbeddedAudioTranslation>? = null,
    /**
     * Le fichier sort de la caméra ou du micro DE L'APPLICATION (déclaré à l'envoi).
     * Défaut `false` : une ligne de cache écrite avant ce champ décode en « pas une
     * capture », la lecture juste — l'absence ne peut pas valoir capture.
     */
    val capturedInApp: Boolean = false,
    /**
     * Effets de la pièce (confettis, flou animé…), miroir `attachment`-level de
     * `MeeshyMessage.effectFlags`. Absent avant ce champ : une ligne ancienne décode
     * en `null` = « pas d'effet connu », jamais « pas d'effet ». Décodé FERMÉ
     * (voir [AttachmentProtection]).
     */
    @Serializable(with = ProtectionFlagsSerializer::class)
    val effectFlags: Long? = null,
    /** D4 — variantes WebP réduites ; une variante partielle est écartée, la pièce se relit. */
    @Serializable(with = LossyMeeshyImageVariantsSerializer::class)
    val imageVariants: List<MeeshyImageVariant>? = null,
    /** Réactions par pièce agrégées (emoji → compte), miroir du `reactionSummary` du message. */
    val reactionSummary: Map<String, Int>? = null,
    /** Emojis posés par l'utilisateur courant sur cette pièce. */
    val currentUserReactions: List<String>? = null,
    // Accusés agrégés « tous les destinataires actifs » : nuls dans une ligne antérieure.
    val deliveredToAllAt: String? = null,
    val viewedByAllAt: String? = null,
    val downloadedByAllAt: String? = null,
    val listenedByAllAt: String? = null,
    val watchedByAllAt: String? = null,
    val viewedCount: Int? = null,
    val downloadedCount: Int? = null,
    val consumedCount: Int? = null,
    /** Progression de consommation du lecteur courant (position + complétion). */
    val currentUserConsumption: MeeshyMediaConsumption? = null,
)
