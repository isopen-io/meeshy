package me.meeshy.sdk.model.composer

/**
 * Fermer le compositeur — croix, retour système, glissé vers le bas (#13838) : un brouillon non vide demande confirmation,
 * comme une diapo (#13616) — le brouillon est sauvegardé automatiquement, garder ferme et le laisse, abandonner ferme et le
 * purge ; un brouillon vide se ferme sans question. La modification d'une story publiée ne garde aucun
 * brouillon : lui proposer de le garder mentirait, elle se ferme comme avant.
 */
object ComposerCloseGuard {
    enum class Outcome { CLOSE, CONFIRM }

    fun onClose(hasContent: Boolean, editingPublished: Boolean): Outcome =
        if (hasContent && !editingPublished) Outcome.CONFIRM else Outcome.CLOSE
}
