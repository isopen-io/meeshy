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
    val avatarThumbHash: String? = null,
    val bannerThumbHash: String? = null,
    val emoji: String = "",
    /** Hex sans dièse ; la couleur déterministe du nom est posée par l'appelant (DynamicColorGenerator, :sdk-core). */
    val color: String = DEFAULT_COLOR,
    /** Nom du thème de conversation (`general` par défaut). */
    val theme: String = DEFAULT_THEME,
    /** Nom de la langue de conversation (`french` par défaut, comme iOS). */
    val language: String = DEFAULT_LANGUAGE,
) {
    companion object {
        const val DEFAULT_COLOR: String = "4ECDC4"
        const val DEFAULT_THEME: String = "general"
        const val DEFAULT_LANGUAGE: String = "french"
    }
}

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
    memberCount = memberCount ?: count?.members ?: members?.size ?: 0,
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
