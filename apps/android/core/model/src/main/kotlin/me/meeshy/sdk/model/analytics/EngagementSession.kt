package me.meeshy.sdk.model.analytics

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/** Une micro-action d'une session ; [atMs] est le décalage monotone depuis son début. */
@Serializable
data class EngagementAction(val type: ActionType, val atMs: Int) {
    @Suppress("EnumEntryName")
    enum class ActionType {
        openedComments, tappedProfile, expandedText, replayed, muted, unmuted,
        paused, resumed, swipedAway, reacted, shared, bookmarked, commented, reported,
    }
}

/** Un échantillon de position de lecture vidéo. */
@Serializable
data class WatchSample(val positionMs: Int, val atMs: Int)

/**
 * Une session de consommation d'un contenu sur une surface : le corps du `dwell`. Absente
 * de l'inventaire du contrat TS (la passerelle reprend le corps de l'ancien
 * `POST /posts/engagement/batch`), donc miroir du Swift `EngagementSession`.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class EngagementSession(
    val sessionId: String,
    val userId: String,
    val postId: String,
    val contentType: ContentType,
    val surface: Surface,
    @Serializable(with = IsoUtcMillisSerializer::class) val startedAt: Long,
    val dwellMs: Int,
    val watchMs: Int? = null,
    val mediaDurationMs: Int? = null,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val completed: Boolean = false,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val truncated: Boolean = false,
    val consent: String,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val actions: List<EngagementAction> = emptyList(),
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val watchSamples: List<WatchSample> = emptyList(),
) {
    @Serializable
    enum class ContentType { POST, REEL, STORY, STATUS }

    @Suppress("EnumEntryName")
    @Serializable
    enum class Surface { detail, reels, storyViewer, statusBubble }
}

/** `startedAt` : millisecondes epoch en mémoire, chaîne ISO 8601 UTC (`…T09:34:23.563Z`) sur le fil. */
object IsoUtcMillisSerializer : KSerializer<Long> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("me.meeshy.IsoUtcMillis", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: Long) = encoder.encodeString(IsoUtc.format(value))

    override fun deserialize(decoder: Decoder): Long =
        IsoUtc.parse(decoder.decodeString()) ?: error("date ISO 8601 illisible")
}

/** Le format de date du fil de comptage : toujours trois chiffres de millisecondes, toujours UTC. */
object IsoUtc {
    private val formatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

    fun format(epochMs: Long): String = formatter.format(Instant.ofEpochMilli(epochMs))

    fun parse(text: String): Long? = runCatching { Instant.parse(text).toEpochMilli() }.getOrNull()
}
