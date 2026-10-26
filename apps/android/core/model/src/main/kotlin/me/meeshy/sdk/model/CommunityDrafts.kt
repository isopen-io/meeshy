package me.meeshy.sdk.model

/**
 * Le brouillon de création d'une communauté (iOS `CommunityCreateViewModel`). Immuable : chaque
 * saisie rend un nouveau brouillon. La passerelle borne le nom à 100 caractères et l'identifiant à
 * `[a-zA-Z0-9-_@]` ; le brouillon refuse en amont ce qu'elle rejetterait.
 */
data class CommunityCreateDraft(
    val name: String = "",
    val identifier: String = "",
    val description: String = "",
    val emoji: String = "",
    val isPrivate: Boolean = true,
    val memberIds: List<String> = emptyList(),
) {
    val trimmedName: String get() = name.trim()
    val isValid: Boolean get() = trimmedName.isNotEmpty()

    fun withName(value: String): CommunityCreateDraft = copy(name = value.take(MAX_NAME_LENGTH))

    fun withIdentifier(value: String): CommunityCreateDraft = copy(identifier = value.filter(::isIdentifierChar))

    /** Choisir l'emoji déjà choisi le retire (bascule). */
    fun withEmojiToggled(value: String): CommunityCreateDraft = copy(emoji = if (emoji == value) "" else value)

    fun withMemberToggled(userId: String): CommunityCreateDraft =
        copy(memberIds = if (userId in memberIds) memberIds - userId else memberIds + userId)

    fun toRequest(): CreateCommunityRequest = CreateCommunityRequest(
        name = trimmedName,
        identifier = identifier.takeIf { it.isNotEmpty() },
        description = description.trim().takeIf { it.isNotEmpty() },
        isPrivate = isPrivate,
    )

    companion object {
        const val MAX_NAME_LENGTH = 100

        fun isIdentifierChar(c: Char): Boolean = c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9' || c == '-' || c == '_' || c == '@'
    }
}

/** Les champs que l'écran de réglages édite : cinq sont serveur, deux (couleur, emoji) sont locaux à l'appareil. */
data class CommunitySettingsFields(
    val name: String,
    val description: String,
    val isPrivate: Boolean,
    val avatarUrl: String,
    val bannerUrl: String,
    val color: String,
    val emoji: String,
)

/**
 * Le brouillon de réglages : l'état d'origine et l'état édité. N'envoie que ce qui a changé
 * (iOS `CommunitySettingsViewModel.save`) ; si seuls la couleur et l'emoji locaux changent, aucune
 * requête ne part.
 */
data class CommunitySettingsDraft(
    val original: CommunitySettingsFields,
    val current: CommunitySettingsFields,
) {
    val hasChanges: Boolean get() = current != original
    val hasLocalChanges: Boolean get() = current.color != original.color || current.emoji != original.emoji
    val canSave: Boolean get() = hasChanges && current.name.trim().isNotEmpty()

    fun edit(transform: (CommunitySettingsFields) -> CommunitySettingsFields): CommunitySettingsDraft =
        copy(current = transform(current))

    /** `null` quand rien de ce que le serveur connaît n'a changé. */
    fun toUpdateRequest(): UpdateCommunityRequest? {
        val name = current.name.trim().takeIf { it != original.name.trim() }
        val description = current.description.trim().takeIf { it != original.description.trim() }
        val isPrivate = current.isPrivate.takeIf { it != original.isPrivate }
        val avatar = current.avatarUrl.takeIf { it != original.avatarUrl && it.isNotEmpty() }
        val banner = current.bannerUrl.takeIf { it != original.bannerUrl && it.isNotEmpty() }
        if (listOf(name, description, isPrivate, avatar, banner).all { it == null }) return null
        return UpdateCommunityRequest(name = name, description = description, isPrivate = isPrivate, avatar = avatar, banner = banner)
    }

    companion object {
        fun of(fields: CommunitySettingsFields): CommunitySettingsDraft = CommunitySettingsDraft(fields, fields)
    }
}
