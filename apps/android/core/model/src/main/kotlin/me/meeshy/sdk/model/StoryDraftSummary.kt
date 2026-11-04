package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Ce qu'il faut pour dresser la liste des brouillons sans en charger aucun (iOS `StoryDraftSummary`) : « Mes stories »
 * n'a besoin ni des effets ni des médias pour rendre une ligne.
 */
public data class StoryDraftSummary(
    val id: String,
    val updatedAtMillis: Long,
    val slideCount: Int,
    /** Premier texte non vide de la story ; `null` : la vue retombe sur un libellé tiré du nombre de diapositives. */
    val title: String?,
    /** Chemin LOCAL de la première image du brouillon encore présente sur disque. */
    val coverFilePath: String?,
    /** Fond de la première slide : la seule chose que TOUT brouillon peut montrer. */
    val backgroundHex: String?,
    /** Composite de toutes les couches, posé dès le PREMIER enregistrement. */
    val thumbHash: String?,
    /** Non nul : une publication est en cours, le brouillon est gelé. */
    val pendingPublishAtMillis: Long? = null,
    /** Dernier échec PERMANENT de publication, affiché jusqu'à la prochaine tentative. */
    val lastPublishError: String? = null,
    /** Non nul : ce brouillon ÉDITE une story déjà publiée. */
    val editingPostId: String? = null,
) {
    val isFrozen: Boolean get() = pendingPublishAtMillis != null
}

/**
 * La fiche légère rangée à côté de chaque brouillon (`meta.json`) : de quoi bâtir un [StoryDraftSummary] en ne lisant
 * que ce petit fichier. Tous les champs sont défaillables : une fiche d'avant se relit.
 */
@Serializable
public data class StoryDraftMeta(
    val updatedAtMillis: Long = 0L,
    val slideCount: Int = 0,
    val title: String? = null,
    /** Les images du brouillon, dans l'ordre des slides ; la vignette est la première dont le fichier existe encore. */
    val coverCandidates: List<String> = emptyList(),
    val backgroundHex: String? = null,
    val thumbHash: String? = null,
    val pendingPublishAtMillis: Long? = null,
    val lastPublishError: String? = null,
    val editingPostId: String? = null,
) {
    public fun toSummary(id: String, mediaDirPath: String, exists: (String) -> Boolean): StoryDraftSummary? {
        if (slideCount <= 0) return null
        val cover = coverCandidates.firstOrNull { exists("$mediaDirPath/$it") }?.let { "$mediaDirPath/$it" }
        return StoryDraftSummary(
            id = id,
            updatedAtMillis = updatedAtMillis,
            slideCount = slideCount,
            title = title,
            coverFilePath = cover,
            backgroundHex = backgroundHex,
            thumbHash = thumbHash,
            pendingPublishAtMillis = pendingPublishAtMillis,
            lastPublishError = lastPublishError,
            editingPostId = editingPostId,
        )
    }

    public companion object {
        /** La fiche d'un instantané : titre = premier texte non vide de la PREMIÈRE slide, fond = le sien. */
        public fun of(
            snapshot: StoryComposerDraftSnapshot,
            nowMillis: Long,
            imageFileNames: List<String>,
            thumbHash: String? = null,
            previous: StoryDraftMeta? = null,
        ): StoryDraftMeta {
            val first = snapshot.slides.firstOrNull()
            val title = first?.let { slide ->
                (slide.elements.map { it.text } + slide.text).map { it.trim() }.firstOrNull { it.isNotEmpty() }
            }
            return StoryDraftMeta(
                updatedAtMillis = nowMillis,
                slideCount = snapshot.slides.size,
                title = title,
                coverCandidates = imageFileNames,
                backgroundHex = first?.background,
                thumbHash = thumbHash ?: previous?.thumbHash,
                pendingPublishAtMillis = previous?.pendingPublishAtMillis,
                lastPublishError = previous?.lastPublishError,
                editingPostId = snapshot.editingPostId,
            )
        }
    }
}
