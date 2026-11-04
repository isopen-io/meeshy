package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Le contour d'avatar équipé, servi avec la personne (#10945) — lecture seule, ce que
 * `ServedProfileDecorItem` (ProfileDecor.swift) porte. [origin] reste une chaîne : une
 * origine inconnue d'une version ultérieure ne doit pas emporter le post.
 */
@Serializable
public data class PostServedRing(
    val pack: String,
    val item: String,
    val origin: String? = null,
    val contract: String? = null,
)

internal object TolerantPostServedRingSerializer :
    TolerantSerializer<PostServedRing>(PostServedRing.serializer())

/** Le décor servi d'une personne ; seul l'anneau d'avatar intéresse les publications. */
@Serializable
public data class PostAuthorDecor(
    @Serializable(with = TolerantPostServedRingSerializer::class)
    val avatarRing: PostServedRing? = null,
)

internal object TolerantPostAuthorDecorSerializer :
    TolerantSerializer<PostAuthorDecor>(PostAuthorDecor.serializer())
