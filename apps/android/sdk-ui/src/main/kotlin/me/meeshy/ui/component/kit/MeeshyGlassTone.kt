package me.meeshy.ui.component.kit

/**
 * Le ton d'un verre : ce qui se lit à travers lui, pas le thème de l'app. Miroir de `MeeshyGlassTone` (iOS).
 *
 * [Plain], [Deep] et [OnLight] sont les trois tons de la planche, élus par la luminance du contenu dessous. [Theme] est le
 * verre actuel des listes et des en-têtes : hors média, à l'encre du thème, que la planche ne dessine pas.
 */
public enum class MeeshyGlassTone {
    Plain,
    Deep,
    OnLight,
    Theme,
    ;

    private fun holds(luminance: Float): Boolean = when (this) {
        Plain -> luminance < PLAIN_CEILING + HYSTERESIS
        Deep -> luminance >= PLAIN_CEILING - HYSTERESIS && luminance < DEEP_CEILING + HYSTERESIS
        OnLight -> luminance >= DEEP_CEILING - HYSTERESIS
        Theme -> false
    }

    public companion object {
        /** Sous cette luminance, le contenu est assez sombre pour un verre clair. */
        public const val PLAIN_CEILING: Float = 0.118f

        /** Au-delà, le contenu est clair : le verre se fonce. */
        public const val DEEP_CEILING: Float = 0.613f

        /** La marge dans laquelle le ton précédent est tenu. */
        public const val HYSTERESIS: Float = 0.03f

        /**
         * La loi du ton. Luminance inconnue ⇒ [Deep]. Avec un ton précédent, la bascule n'a lieu qu'une fois sortie de
         * l'hystérésis de sa bande ; [Theme] n'a pas de bande et n'est jamais tenu.
         */
        public fun resolve(luminance: Float?, previous: MeeshyGlassTone? = null): MeeshyGlassTone {
            if (luminance == null) return Deep
            if (previous != null && previous.holds(luminance)) return previous
            return band(luminance)
        }

        private fun band(luminance: Float): MeeshyGlassTone = when {
            luminance < PLAIN_CEILING -> Plain
            luminance < DEEP_CEILING -> Deep
            else -> OnLight
        }
    }
}

/** La densité d'un verre : [Dense] porte du texte. */
public enum class MeeshyGlassDensity {
    Regular,
    Dense,
}
