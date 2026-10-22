package me.meeshy.sdk.model

/** La surface qui parle : la feuille qui explique avant de demander, ou la carte de refus définitif. */
enum class PermissionSurface { RATIONALE, DENIED }

/**
 * Les clés (noms de ressources Android) du titre, du corps et du libellé d'action de chaque
 * nature de permission. Le texte lui-même vit dans les ressources localisées ; ce présentateur
 * ne dit que QUEL texte, de sorte qu'aucune nature ne retombe sur un message générique
 * (« accès refusé ») qui n'apprend pas quelle ligne activer.
 */
data class PermissionPresentation(
    val titleKey: String,
    val bodyKey: String,
    val actionKey: String,
) {
    companion object {
        const val RATIONALE_ACTION_KEY = "media_permission_continue"
        const val DENIED_ACTION_KEY = "media_permission_open_settings"

        fun of(nature: PermissionNature, surface: PermissionSurface): PermissionPresentation {
            val prefix = "media_permission_${nature.slug}_${surface.keyToken}"
            return PermissionPresentation(
                titleKey = "${prefix}_title",
                bodyKey = "${prefix}_body",
                actionKey = if (surface == PermissionSurface.RATIONALE) RATIONALE_ACTION_KEY else DENIED_ACTION_KEY,
            )
        }

        /** Le message d'une ligne par accès (toast, annonce) : « Micro refusé — … Réglages ». */
        fun deniedMessageKey(nature: PermissionNature): String = "media_permission_${nature.slug}_denied_message"

        private val PermissionSurface.keyToken: String
            get() = when (this) {
                PermissionSurface.RATIONALE -> "rationale"
                PermissionSurface.DENIED -> "denied"
            }
    }
}
