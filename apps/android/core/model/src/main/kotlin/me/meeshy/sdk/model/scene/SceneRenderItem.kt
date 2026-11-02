package me.meeshy.sdk.model.scene

/**
 * Un élément du plan de rendu : ce que le canevas peint, déjà résolu (pose, opacité composée,
 * texte servi par le Prisme). Pur : aucune vue, aucun Android.
 */
public data class SceneRenderItem(
    val source: MeeshySceneObject,
    val plane: ScenePlane,
    val pose: ScenePose,
    val presence: ScenePresence,
    /** Texte à peindre (textes seulement) : l'original en édition, le texte servi en lecture. */
    val displayText: String?,
    /** Langue du texte servi ; `null` : l'original est affiché. */
    val servedLanguage: String?,
    /** Les langues du lecteur, injectées à tout objet portant une langue. */
    val readerLanguages: List<String>,
    val isLocked: Boolean,
) {
    public val id: String get() = source.id
    public val kind: MeeshySceneObject.Kind get() = source.kind
    public val zIndex: Int get() = source.zIndex
    public val isGhost: Boolean get() = presence == ScenePresence.GHOST

    public val signature: SceneItemSignature by lazy(LazyThreadSafetyMode.NONE) {
        SceneItemSignature(id, pose, presence, readerLanguages, contentKey())
    }

    private fun contentKey(): String? = when (val s = source) {
        is MeeshySceneObject.Text -> displayText
        is MeeshySceneObject.Media -> s.value.postMediaId
        is MeeshySceneObject.Sticker -> s.value.emoji
        is MeeshySceneObject.Place, is MeeshySceneObject.Audio -> null
    }
}
