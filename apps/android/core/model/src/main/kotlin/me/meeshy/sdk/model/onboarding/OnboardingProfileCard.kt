package me.meeshy.sdk.model.onboarding

import me.meeshy.sdk.model.ImageUploadTarget

/**
 * Une des deux images de la carte « Montre-toi » (#17238). [confirmed] est l'adresse que le serveur connaît ; [pending]
 * l'aperçu LOCAL de l'image en cours d'envoi, montré aussitôt (téléversement optimiste). [failed] : le dernier envoi a
 * échoué, la carte est revenue à l'image précédente et propose « Réessayer ». [posed] : une image a été posée PENDANT
 * cette carte (iOS `OnboardingProfileImage.confirmed`).
 */
data class OnboardingProfileSlot(
    val confirmed: String? = null,
    val pending: String? = null,
    val failed: Boolean = false,
    val posed: Boolean = false,
) {
    val shown: String? get() = pending ?: confirmed

    val isUploading: Boolean get() = pending != null
}

/**
 * Le geste principal de la carte : « Plus tard » seul tant qu'aucune image n'est choisie, « Continuer » (et « Plus tard »
 * en second) dès qu'une image est posée OU en cours d'envoi — la règle de la carte « Trouve ta bande » (iOS).
 */
enum class OnboardingProfilePrimary { LATER, CONTINUE }

/**
 * L'état PUR de la carte « Montre-toi » : chaque transition rend un nouvel état. Ce qui est décidé ICI : l'aperçu montré
 * pendant l'envoi, le retour à l'image précédente sur échec, le geste principal et l'issue de l'étape.
 */
data class OnboardingProfileCard(
    val avatar: OnboardingProfileSlot = OnboardingProfileSlot(),
    val banner: OnboardingProfileSlot = OnboardingProfileSlot(),
) {
    fun slot(target: ImageUploadTarget): OnboardingProfileSlot = when (target) {
        ImageUploadTarget.AVATAR -> avatar
        ImageUploadTarget.BANNER -> banner
    }

    /** Une image choisie s'affiche AUSSITÔT ; un second choix pendant un envoi en cours est ignoré. */
    fun picked(target: ImageUploadTarget, preview: String): OnboardingProfileCard {
        val current = slot(target)
        if (current.isUploading) return this
        return with(target, current.copy(pending = preview, failed = false))
    }

    fun uploaded(target: ImageUploadTarget, url: String): OnboardingProfileCard =
        with(target, slot(target).copy(confirmed = url, pending = null, failed = false, posed = true))

    /** L'envoi a échoué : l'image précédente revient, et l'échec est dit. */
    fun failed(target: ImageUploadTarget): OnboardingProfileCard =
        with(target, slot(target).copy(pending = null, failed = true))

    fun dismissFailure(target: ImageUploadTarget): OnboardingProfileCard =
        with(target, slot(target).copy(failed = false))

    val isUploading: Boolean get() = avatar.isUploading || banner.isUploading

    /** Une image posée ou en vol : l'utilisateur s'est montré, l'envoi n'attend pas « Continuer » (iOS `hasChosenImage`). */
    val hasChosenImage: Boolean get() = avatar.posed || banner.posed || isUploading

    val failedTargets: List<ImageUploadTarget> get() = ImageUploadTarget.entries.filter { slot(it).failed }

    val primary: OnboardingProfilePrimary
        get() = if (hasChosenImage) OnboardingProfilePrimary.CONTINUE else OnboardingProfilePrimary.LATER

    /** L'issue écrite au serveur quand la carte se quitte par son geste principal. */
    val outcome: OnboardingStepOutcome
        get() = if (hasChosenImage) OnboardingStepOutcome.DONE else OnboardingStepOutcome.SKIPPED

    private fun with(target: ImageUploadTarget, slot: OnboardingProfileSlot): OnboardingProfileCard = when (target) {
        ImageUploadTarget.AVATAR -> copy(avatar = slot)
        ImageUploadTarget.BANNER -> copy(banner = slot)
    }

    companion object {
        /** Le compte porte déjà avatar ET bannière : la carte n'a rien à proposer (filet devant une passerelle ancienne). */
        fun isComplete(avatarUrl: String?, bannerUrl: String?): Boolean =
            !avatarUrl.isNullOrBlank() && !bannerUrl.isNullOrBlank()

        /** La carte telle que le compte la montre déjà : ses images actuelles, rien de posé. */
        fun of(avatarUrl: String?, bannerUrl: String?): OnboardingProfileCard = OnboardingProfileCard(
            avatar = OnboardingProfileSlot(confirmed = avatarUrl?.takeIf { it.isNotBlank() }),
            banner = OnboardingProfileSlot(confirmed = bannerUrl?.takeIf { it.isNotBlank() }),
        )
    }
}
