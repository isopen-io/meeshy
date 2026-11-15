package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import me.meeshy.sdk.model.serialization.LossyListSerializer
import me.meeshy.sdk.model.serialization.LossyNullableListSerializer
import me.meeshy.sdk.model.serialization.TolerantSerializer

/**
 * La progression de consommation PERSONNELLE du lecteur courant sur un média
 * (position + complétion), servie par requête par la passerelle — jumelle de
 * `currentUserReactions`. Elle sème la teinte de la forme d'onde (audio) et la
 * barre de progression (vidéo) dès le chargement, synchronisée entre appareils.
 * `null` = le lecteur n'a jamais consommé ce média.
 *
 * Miroir de `MeeshyMediaConsumption` (iOS) et de `CurrentUserAttachmentConsumption`
 * (`packages/shared/types/attachment.ts`).
 */
@Serializable
data class MeeshyMediaConsumption(
    val lastPlayPositionMs: Int? = null,
    val listenedComplete: Boolean = false,
    val lastWatchPositionMs: Int? = null,
    val watchedComplete: Boolean = false,
)

/**
 * Une pièce jointe de message dans une réponse d'API — miroir de
 * `APIMessageAttachment` (iOS, `APIMessageAttachment.swift`).
 *
 * Le modèle garde TOUT ce que la passerelle sert : les dimensions et métadonnées
 * audio/vidéo/document, la protection PAR PIÈCE (vue unique, flou, `effectFlags` —
 * voir [AttachmentProtection], fermée par défaut), l'enveloppe E2EE (`encryptionIv`,
 * `encryptionAuthTag` : sans elles le client ne peut pas déchiffrer le fichier), les
 * variantes WebP responsives, les réactions par pièce, la consommation du lecteur et
 * les accusés agrégés.
 *
 * Un modèle plus STRICT que son fil ne perd pas le champ, il perd le CONTENU PORTEUR :
 * une pièce écrite à moitié emporterait son message. D'où la tolérance PAR CHAMP —
 * variantes d'image (élément par élément), blobs du Prisme, décorations — et la
 * fermeture des canaux de protection ; tout champ est nullable ou a un défaut, si
 * bien qu'une ancienne ligne de cache Room sans les champs récents se relit.
 *
 * `metadata` (blob JSON libre) n'est volontairement pas décodé : aucun consommateur
 * ne le lit.
 */
@Serializable
data class ApiMessageAttachment(
    val id: String,
    val fileName: String? = null,
    val originalName: String? = null,
    val mimeType: String? = null,
    val fileSize: Int? = null,
    val fileUrl: String? = null,
    val thumbnailUrl: String? = null,
    val thumbHash: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    val duration: Int? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    /** Author-authored accessibility description (`MessageAttachment.alt`, #6813). Bare pass-through, no Prisme translation. */
    val alt: String? = null,
    /**
     * Blob du Prisme Linguistique : un worker peut l'écrire à moitié pendant
     * l'enrichissement, une entrée malformée vaut `null` et ne coûte pas la pièce.
     */
    @Serializable(with = TolerantAttachmentTranscriptionSerializer::class)
    val transcription: ApiAttachmentTranscription? = null,
    @Serializable(with = TolerantAttachmentTranslationsSerializer::class)
    val translations: Map<String, ApiAttachmentTranslation>? = null,

    // ── Identité et provenance ──
    val messageId: String? = null,
    val uploadedBy: String? = null,
    val isAnonymous: Boolean? = null,
    val createdAt: String? = null,
    val forwardedFromAttachmentId: String? = null,
    val isForwarded: Boolean? = null,
    /**
     * Le fichier sort de la caméra ou du micro DE L'APPLICATION — déclaré par le
     * client qui a capturé, à l'envoi, puis rendu par la passerelle. La feuille de
     * partage le lit pour décider si PUBLIER ce média demande confirmation.
     */
    val capturedInApp: Boolean? = null,

    // ── Visuel ──
    /** D4 — variantes WebP réduites ; un élément malformé est écarté, les autres restent. */
    @Serializable(with = LossyMeeshyImageVariantsSerializer::class)
    val imageVariants: List<MeeshyImageVariant>? = null,

    // ── Audio / vidéo ──
    val bitrate: Int? = null,
    val sampleRate: Int? = null,
    val codec: String? = null,
    val channels: Int? = null,
    val fps: Double? = null,
    val videoCodec: String? = null,

    // ── Document ──
    val pageCount: Int? = null,
    val lineCount: Int? = null,

    // ── Protection PAR PIÈCE : vue unique / flou / bitfield (voir AttachmentProtection) ──
    @Serializable(with = ProtectionBooleanSerializer::class)
    val isViewOnce: Boolean? = null,
    val maxViewOnceCount: Int? = null,
    val viewOnceCount: Int? = null,
    @Serializable(with = ProtectionBooleanSerializer::class)
    val isBlurred: Boolean? = null,
    @Serializable(with = ProtectionFlagsSerializer::class)
    val effectFlags: Long? = null,

    // ── Enveloppe E2EE : requise pour déchiffrer le fichier ──
    val isEncrypted: Boolean? = null,
    val encryptionMode: String? = null,
    val encryptionIv: String? = null,
    val encryptionAuthTag: String? = null,

    // ── Réactions par pièce et progression du lecteur courant ──
    @Serializable(with = TolerantReactionSummarySerializer::class)
    val reactionSummary: Map<String, Int>? = null,
    @Serializable(with = TolerantCurrentUserReactionsSerializer::class)
    val currentUserReactions: List<String>? = null,
    @Serializable(with = TolerantMediaConsumptionSerializer::class)
    val currentUserConsumption: MeeshyMediaConsumption? = null,

    // ── Accusés agrégés « tous les destinataires actifs » (posés par la passerelle) ──
    val deliveredToAllAt: String? = null,
    val viewedByAllAt: String? = null,
    val downloadedByAllAt: String? = null,
    val listenedByAllAt: String? = null,
    val watchedByAllAt: String? = null,
    val viewedCount: Int? = null,
    val downloadedCount: Int? = null,
    val consumedCount: Int? = null,
)

internal object TolerantAttachmentTranscriptionSerializer :
    KSerializer<ApiAttachmentTranscription?> by TolerantSerializer(ApiAttachmentTranscription.serializer())

internal object TolerantAttachmentTranslationsSerializer :
    KSerializer<Map<String, ApiAttachmentTranslation>?> by TolerantSerializer(
        MapSerializer(String.serializer(), ApiAttachmentTranslation.serializer()),
    )

internal object TolerantReactionSummarySerializer :
    KSerializer<Map<String, Int>?> by TolerantSerializer(MapSerializer(String.serializer(), Int.serializer()))

internal object TolerantCurrentUserReactionsSerializer :
    KSerializer<List<String>?> by TolerantSerializer(ListSerializer(String.serializer()))

internal object TolerantMediaConsumptionSerializer :
    KSerializer<MeeshyMediaConsumption?> by TolerantSerializer(MeeshyMediaConsumption.serializer())

/**
 * Liste de pièces jointes tolérante — le sérialiseur que les lots de messages posent
 * sur leurs `attachments` : une pièce qui ne se décode pas est ÉCARTÉE, le message et
 * ses autres pièces survivent. Saveur `List<…> = emptyList()`.
 */
object LossyApiMessageAttachmentListSerializer :
    KSerializer<List<ApiMessageAttachment>> by LossyListSerializer(ApiMessageAttachment.serializer())

/** Saveur `List<…>? = null` : l'absence reste `null`, jamais une liste vide inventée. */
object LossyApiMessageAttachmentListOrNullSerializer :
    KSerializer<List<ApiMessageAttachment>?> by LossyNullableListSerializer(ApiMessageAttachment.serializer())
