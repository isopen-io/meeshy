package me.meeshy.sdk.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * `engagement:post-updated` — la valeur de `viewerPoints` d'un post à l'instant serveur [at] (ms).
 * Miroir de `PostEngagementSnapshot` (`packages/shared/types/engagement-scale.ts`, iOS
 * `PostEngagementSnapshot`). Poussé au seul lecteur crédité ; la valeur est ABSOLUE et peut BAISSER
 * (un contenu retiré reprend ses points).
 */
@Serializable(with = PostEngagementSnapshotSerializer::class)
public data class PostEngagementSnapshot(
    val postId: String,
    val viewerPoints: Int,
    val at: Long,
)

/** Garde `isPostEngagementSnapshot` : un identifiant non vide, deux entiers positifs ou nuls. */
public object PostEngagementSnapshotSerializer : KSerializer<PostEngagementSnapshot> {
    @Serializable
    private data class Wire(val postId: String, val viewerPoints: Int, val at: Long)

    private val delegate = Wire.serializer()
    override val descriptor: SerialDescriptor = delegate.descriptor

    override fun deserialize(decoder: Decoder): PostEngagementSnapshot {
        val wire = delegate.deserialize(decoder)
        if (wire.postId.isEmpty() || wire.viewerPoints < 0 || wire.at < 0) {
            throw SerializationException("engagement:post-updated malformé")
        }
        return PostEngagementSnapshot(wire.postId, wire.viewerPoints, wire.at)
    }

    override fun serialize(encoder: Encoder, value: PostEngagementSnapshot) {
        delegate.serialize(encoder, Wire(value.postId, value.viewerPoints, value.at))
    }
}

/** Ce qu'un client sait de `viewerPoints` d'un post : la valeur, et l'instant de la dernière ANNONCE appliquée. */
public data class KnownViewerPoints(val viewerPoints: Int, val at: Long?)

/** Les lois de `viewerPoints` — miroir de `keptViewerPoints` et de `PostViewerPoints` iOS. */
public object PostViewerPoints {

    /** Plafond de posts suivis ; au-delà, les points connus repartent de zéro. */
    public const val MAX_TRACKED_POSTS: Int = 2_000

    /**
     * Ce qu'un client GARDE quand une valeur lui arrive : une ANNONCE (porte [at]) s'applique si elle n'est
     * pas plus ancienne que la dernière annonce appliquée, qu'elle monte ou qu'elle baisse ; une LECTURE
     * (sans [at]) s'applique et garde l'instant connu ; champ absent : rien ne change.
     */
    public fun kept(known: KnownViewerPoints?, viewerPoints: Int?, at: Long?): KnownViewerPoints? {
        if (viewerPoints == null) return known
        if (at == null) return KnownViewerPoints(viewerPoints, known?.at)
        val knownAt = known?.at
        if (knownAt != null && at < knownAt) return known
        return KnownViewerPoints(viewerPoints, at)
    }

    /** La marque ne paraît que pour un gain : `null` ou `0` ⇒ aucune marque. */
    public fun shown(viewerPoints: Int?): Int? = viewerPoints?.takeIf { it > 0 }
}
