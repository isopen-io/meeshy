package me.meeshy.sdk.model.appearance

/**
 * Le contour qu'un avatar pose — miroir d'iOS `MeeshyAvatar` (`ringDesign = kind == .user ? ProfileDecorResolver.ring(ring) : nil`) :
 * le contour déjà résolu par l'hôte prime ; sinon celui que la PERSONNE a équipé (`profileDecor.avatarRing`, résolu par le
 * catalogue). Une entité (groupe, communauté) n'a pas de contour équipé : elle ne porte jamais celui d'une personne.
 */
object AvatarRingChoice {

    fun effective(explicit: AvatarRingDesign?, equipped: AvatarRingDesign?, isUser: Boolean): AvatarRingDesign? =
        explicit ?: equipped.takeIf { isUser }
}
