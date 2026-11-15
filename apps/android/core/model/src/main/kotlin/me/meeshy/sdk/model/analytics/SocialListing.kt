package me.meeshy.sdk.model.analytics

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/** D'où vient le classement d'un listing ; une valeur inconnue se lit [OTHER]. */
@Serializable(with = SocialRankingSourceSerializer::class)
enum class SocialRankingSource(val wire: String) {
    FOLLOWING("following"), FOR_YOU("for_you"), TRENDING("trending"), NEARBY("nearby"),
    SEARCH("search"), HASHTAG("hashtag"), SOUND("sound"), PROFILE("profile"),
    BOOKMARKS("bookmarks"), OTHER("other");

    companion object {
        fun fromWire(value: String?): SocialRankingSource =
            entries.firstOrNull { it.wire == value } ?: OTHER
    }
}

object SocialRankingSourceSerializer : KSerializer<SocialRankingSource> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("me.meeshy.SocialRankingSource", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: SocialRankingSource) = encoder.encodeString(value.wire)

    override fun deserialize(decoder: Decoder): SocialRankingSource =
        SocialRankingSource.fromWire(decoder.decodeString())
}

/** Le contexte de listing d'une impression : rang rendu, page servie, source de classement. */
@Serializable
data class SocialListing(
    val feedRequestId: String? = null,
    val position: Int? = null,
    val rankingSource: SocialRankingSource? = null,
    val listingSessionId: String? = null,
)

/** La visibilité (au sens MRC) d'une impression, quand elle n'était pas connue au départ du lot. */
@Serializable
data class SocialVisibility(
    val maxVisibleFraction: Double,
    val visibleMs: Int,
    val viewable: Boolean,
    val impressionEventId: String? = null,
) {
    companion object {
        /** Une fraction 0…1 à deux décimales ; non finie = 0. */
        fun fraction(value: Double): Double =
            if (!value.isFinite()) 0.0 else Math.round(value.coerceIn(0.0, 1.0) * 100) / 100.0

        fun of(maxVisibleFraction: Double, visibleMs: Int, viewable: Boolean, impressionEventId: String? = null) =
            SocialVisibility(fraction(maxVisibleFraction), maxOf(0, visibleMs), viewable, impressionEventId)
    }
}
