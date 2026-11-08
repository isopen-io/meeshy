package me.meeshy.sdk.model.avatar

/** Ce que le toucher d'un avatar déclenche. Miroir de `MeeshyAvatar.handleTap` (iOS). */
public enum class AvatarTapTarget { STORY, TAP, PROFILE, NONE }

/** Un geste exprimable par le menu contextuel : profil, story, ou entrée de l'hôte (clé libre). */
public enum class AvatarMenuKind { PROFILE, STORY, CUSTOM }

/** Une entrée résolue du menu : son genre et le libellé RENDU, seule clé de déduplication. */
public data class AvatarMenuEntry(val kind: AvatarMenuKind, val label: String, val customKey: String? = null)

/**
 * La loi d'interaction d'un avatar, pure (miroir de `MeeshyAvatar` iOS : `handleTap`, `hasTapHandler`,
 * `effectiveContextMenuItems`). L'écran n'en est que la projection.
 */
public object AvatarInteraction {

    /**
     * Une story NON LUE ouvre la story quand l'hôte sait l'ouvrir ; sinon `onTap` ; sinon le profil.
     * Une story lue ne détourne jamais le toucher.
     */
    public fun tapTarget(
        storyUnread: Boolean,
        hasViewStory: Boolean,
        hasTap: Boolean,
        hasViewProfile: Boolean,
    ): AvatarTapTarget = when {
        storyUnread && hasViewStory -> AvatarTapTarget.STORY
        hasTap -> AvatarTapTarget.TAP
        hasViewProfile -> AvatarTapTarget.PROFILE
        else -> AvatarTapTarget.NONE
    }

    /** Le contexte est tactile ET l'hôte a posé au moins un geste. */
    public fun isTappable(contextTappable: Boolean, hasTap: Boolean, hasViewProfile: Boolean, hasViewStory: Boolean): Boolean =
        contextTappable && (hasTap || hasViewProfile || hasViewStory)

    /**
     * Le menu : « Voir le profil » d'abord, « Voir la story » seulement pour un utilisateur qui A une story,
     * puis les entrées de l'hôte. Une entrée de l'hôte dont le libellé RENDU égale un libellé déjà présent
     * est écartée : jamais deux « Voir le profil ». Vide hors contexte tactile.
     */
    public fun menu(
        contextTappable: Boolean,
        isUser: Boolean,
        hasStory: Boolean,
        hasViewProfile: Boolean,
        hasViewStory: Boolean,
        profileLabel: String,
        storyLabel: String,
        custom: List<AvatarMenuEntry>,
    ): List<AvatarMenuEntry> {
        if (!contextTappable) return emptyList()
        val base = buildList {
            if (hasViewProfile) add(AvatarMenuEntry(AvatarMenuKind.PROFILE, profileLabel))
            if (hasViewStory && isUser && hasStory) add(AvatarMenuEntry(AvatarMenuKind.STORY, storyLabel))
        }
        return custom.fold(base) { acc, entry -> if (acc.any { it.label == entry.label }) acc else acc + entry }
    }
}
