package me.meeshy.sdk.model.profile

/**
 * Les trois faces de la fiche d'un autre (planche « profil, vue finale », loi 1) : la Vitrine dit qui il est, les Liens ce qui
 * amène vers lui, les Actions ce que je peux faire. La face initiale est [VITRINE].
 */
enum class ProfileFace {
    VITRINE,
    LIENS,
    ACTIONS;

    companion object {
        val DEFAULT: ProfileFace = VITRINE

        /** Un nom enregistré se relit ; un nom qu'on ne connaît pas (version plus récente) retombe sur la Vitrine. */
        fun restored(saved: String?): ProfileFace = entries.firstOrNull { it.name == saved } ?: DEFAULT
    }
}

/**
 * Qui a un sélecteur de faces. Seule la fiche RÉSOLUE d'un autre en a un : ma propre fiche n'a pas d'actions, une personne que
 * j'ai bloquée ou qui m'a bloqué n'a pas de faces (la carte « Débloquer » ou la fermeture), et tant que le plan n'est pas
 * résolu rien n'est offert — fermé par défaut.
 */
object ProfileFaceRule {
    fun offered(isSelf: Boolean, plan: ProfileActionPlan?): List<ProfileFace> {
        if (isSelf || plan == null) return emptyList()
        if (plan.layout != ProfileLayout.NORMAL || !plan.showsTabs) return emptyList()
        return ProfileFace.entries
    }

    /** La face PEINTE : la choisie si elle est offerte, sinon la Vitrine. */
    fun shown(selected: ProfileFace, offered: List<ProfileFace>): ProfileFace =
        if (selected in offered) selected else ProfileFace.DEFAULT
}
