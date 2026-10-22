package me.meeshy.sdk.model

/** Cold-load / resolution phase for the per-link detail screen. */
public enum class ShareLinkDetailPhase { Loading, Loaded, NotFound, Error }

/** Le retour d'un enregistrement ou d'une action, dit une fois à l'écran (toast) puis acquitté. */
public enum class ShareLinkDetailFeedback { Saved, SaveFailed, ActionFailed }

/**
 * Immutable UDF state for the per-link share-link detail screen (the Android take on
 * iOS `ShareLinkDetailView`, upgraded to an optimistic-update model).
 *
 * There is no per-link owner endpoint (the owner counters `currentUses` / `maxUses`
 * live only in the list payload), so the detail [resolved]s its [MyShareLink] out of
 * the fetched owner list by [MyShareLink.linkId] — a linkId absent from the list is
 * surfaced as [ShareLinkDetailPhase.NotFound] rather than an endless spinner, exactly
 * as `PostDetailViewModel` handles a missing post. Toggle applies optimistically; the
 * ViewModel snapshots and restores on network failure. Delete raises [isDeleted] so
 * the screen can pop back to a coherent place.
 */
public data class ShareLinkDetailState(
    val phase: ShareLinkDetailPhase = ShareLinkDetailPhase.Loading,
    val link: MyShareLink? = null,
    val presentation: ShareLinkDetailPresentation? = null,
    val errorMessage: String? = null,
    val isDeleted: Boolean = false,
    val draft: ShareLinkEditDraft = ShareLinkEditDraft(),
    val isSaving: Boolean = false,
    val feedback: ShareLinkDetailFeedback? = null,
) {
    /** Le brouillon diffère de ce que le lien sert. */
    public val hasChanges: Boolean
        get() = link?.let { draft != ShareLinkEditDraft.from(it) } ?: false

    /** « Enregistrer » n'est proposé que pour un brouillon modifié, valide, hors enregistrement en cours. */
    public val canSave: Boolean get() = hasChanges && draft.isValid && !isSaving

    /** Le corps du PATCH : seulement ce qui a changé ; `null` s'il n'y a rien à envoyer. */
    public fun patch(): kotlinx.serialization.json.JsonObject? =
        link?.let { draft.patchAgainst(ShareLinkEditDraft.from(it)) }

    /**
     * La fiche peinte DEPUIS la ligne de liste qui l'a ouverte (cache d'abord) : aucune
     * attente du réseau, le lien et son brouillon sont là dès la première image.
     */
    public fun fromRow(link: MyShareLink, webOrigin: String, nowMillis: Long): ShareLinkDetailState =
        copy(
            phase = ShareLinkDetailPhase.Loaded,
            link = link,
            presentation = ShareLinkDetailPresentation.from(link, webOrigin, nowMillis),
            draft = ShareLinkEditDraft.from(link),
            errorMessage = null,
        )

    /** Remplace le brouillon (saisie dans le formulaire). */
    public fun withDraft(draft: ShareLinkEditDraft): ShareLinkDetailState = copy(draft = draft)

    /**
     * Applique le brouillon à l'écran AVANT le réseau : la fiche montre déjà le lien modifié.
     * Inerte sans lien résolu ou si [canSave] est faux.
     */
    public fun saving(webOrigin: String, nowMillis: Long): ShareLinkDetailState {
        val current = link ?: return this
        if (!canSave) return this
        val optimistic = draft.applyTo(current)
        return copy(
            link = optimistic,
            presentation = ShareLinkDetailPresentation.from(optimistic, webOrigin, nowMillis),
            isSaving = true,
            feedback = null,
        )
    }

    public fun saved(): ShareLinkDetailState = copy(isSaving = false, feedback = ShareLinkDetailFeedback.Saved)

    /** Échec : le lien d'avant revient, le BROUILLON reste pour réessayer sans tout ressaisir. */
    public fun saveFailed(previous: MyShareLink, webOrigin: String, nowMillis: Long): ShareLinkDetailState =
        copy(
            link = previous,
            presentation = ShareLinkDetailPresentation.from(previous, webOrigin, nowMillis),
            isSaving = false,
            feedback = ShareLinkDetailFeedback.SaveFailed,
        )

    /** Annule une activation optimiste : le lien d'avant revient, le brouillon en cours est conservé. */
    public fun toggleFailed(previous: MyShareLink, webOrigin: String, nowMillis: Long): ShareLinkDetailState =
        copy(
            link = previous,
            presentation = ShareLinkDetailPresentation.from(previous, webOrigin, nowMillis),
            feedback = ShareLinkDetailFeedback.ActionFailed,
        )

    public fun actionFailed(): ShareLinkDetailState = copy(feedback = ShareLinkDetailFeedback.ActionFailed)

    public fun feedbackShown(): ShareLinkDetailState = copy(feedback = null)

    /** A blocking placeholder is warranted only on a cold load with nothing resolved yet. */
    public val showColdSpinner: Boolean
        get() = phase == ShareLinkDetailPhase.Loading && link == null

    /** Enter the loading phase, clearing any prior error (a resolved link is kept). */
    public fun loading(): ShareLinkDetailState =
        copy(phase = ShareLinkDetailPhase.Loading, errorMessage = null)

    /**
     * Resolve the detail from the owner [links] by [linkId]. Builds the pure
     * [ShareLinkDetailPresentation] against [webOrigin] / [nowMillis] when found,
     * else settles in [ShareLinkDetailPhase.NotFound].
     */
    public fun resolved(
        links: List<MyShareLink>,
        linkId: String,
        webOrigin: String,
        nowMillis: Long,
    ): ShareLinkDetailState {
        val match = links.firstOrNull { it.linkId == linkId }
            ?: return copy(
                phase = ShareLinkDetailPhase.NotFound,
                link = null,
                presentation = null,
                errorMessage = null,
            )
        return copy(
            phase = ShareLinkDetailPhase.Loaded,
            link = match,
            presentation = ShareLinkDetailPresentation.from(match, webOrigin, nowMillis),
            draft = ShareLinkEditDraft.from(match),
            errorMessage = null,
        )
    }

    /** Settle in an error phase, surfacing [message] while keeping any resolved link. */
    public fun failed(message: String?): ShareLinkDetailState =
        copy(phase = ShareLinkDetailPhase.Error, errorMessage = message)

    /**
     * Optimistically flip the resolved link's active flag (link + presentation kept in
     * step). Inert when no link is resolved.
     */
    public fun toggled(): ShareLinkDetailState {
        val current = link ?: return this
        val flipped = current.copy(isActive = !current.isActive)
        return copy(
            link = flipped,
            presentation = presentation?.copy(isActive = flipped.isActive),
        )
    }

    /** Raise the deleted signal so the screen pops back to the list. */
    public fun markDeleted(): ShareLinkDetailState = copy(isDeleted = true)

    /**
     * Dismiss a surfaced error without a reload: returns to [ShareLinkDetailPhase.Loaded]
     * when a link is resolved, else back to [ShareLinkDetailPhase.NotFound]. Inert when no
     * error is surfaced.
     */
    public fun dismissError(): ShareLinkDetailState {
        if (errorMessage == null) return this
        val restored = if (link != null) ShareLinkDetailPhase.Loaded else ShareLinkDetailPhase.NotFound
        return copy(phase = restored, errorMessage = null)
    }
}
