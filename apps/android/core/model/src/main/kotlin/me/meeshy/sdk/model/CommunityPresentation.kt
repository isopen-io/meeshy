package me.meeshy.sdk.model

/**
 * Communauté telle que les écrans la montrent — port de `MeeshyCommunity` (MeeshyCommunity.swift).
 * L'apparence locale (couleur, emoji) n'y figure pas : elle vit sur l'appareil, par identifiant.
 */
data class Community(
    val id: String,
    val identifier: String,
    val name: String,
    val description: String? = null,
    val avatar: String? = null,
    val banner: String? = null,
    val isPrivate: Boolean = true,
    val isActive: Boolean = true,
    val createdBy: String = "",
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val memberCount: Int = 0,
    val conversationCount: Int = 0,
)

/**
 * Projection `ApiCommunity` -> [Community] (iOS `toCommunity`). Les compteurs plats servis par
 * `GET /communities` priment ; l'objet Prisma `_count` des anciennes charges prend le relais ;
 * zéro en dernier recours.
 */
fun ApiCommunity.toCommunity(): Community = Community(
    id = id,
    identifier = identifier,
    name = name,
    description = description,
    avatar = avatar,
    banner = banner,
    isPrivate = isPrivate,
    createdBy = createdBy,
    createdAt = createdAt,
    updatedAt = updatedAt ?: createdAt,
    memberCount = memberCount ?: count?.members ?: 0,
    conversationCount = conversationCount ?: count?.conversation ?: 0,
)

fun ApiCommunitySearchResult.toCommunity(): Community = Community(
    id = id,
    identifier = identifier,
    name = name,
    description = description,
    avatar = avatar,
    isPrivate = isPrivate,
    createdAt = createdAt,
    updatedAt = createdAt,
    memberCount = memberCount ?: 0,
    conversationCount = conversationCount ?: 0,
)
