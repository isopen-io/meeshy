package me.meeshy.sdk.model

/**
 * La reprise d'un envoi bloqué dans un composer VIERGE (iOS `FeedViewModel.recoverUnsentPost` +
 * `FeedView.recoverStuckPostDraftIfNeeded`). Ce que la file retient trop longtemps redevient un brouillon, mais
 * jamais par-dessus ce que l'auteur écrit, et jamais quand un vocal l'accompagne.
 */
object StuckPublicationRecovery {

    /** Une ligne `CREATE_POST` encore dans la file, telle que la reprise la regarde. */
    data class Candidate(
        val cmid: String,
        val state: PublicationRowState,
        val createdAtMillis: Long,
        /** `POST` ou `REEL`, le type sous lequel la ligne est partie ; `null` pour une ligne ancienne. */
        val type: String?,
        val hasVoice: Boolean,
    )

    /** Le composer est vierge quand ni son brouillon de post ni celui de story ne valent d'être rouverts. */
    fun isComposerBlank(editing: PostComposerDraftSnapshot?, story: StoryComposerDraftSnapshot?): Boolean =
        editing?.isWorthRestoring != true && story?.isWorthRestoring != true

    /**
     * La DERNIÈRE ligne bloquée, ou `null`. Un vocal bloqué la rend indisponible sans laisser passer une ligne plus
     * ancienne : un brouillon plus ancien proposé en sautant l'enregistrement le ferait oublier.
     */
    fun pick(candidates: List<Candidate>, nowMillis: Long): Candidate? =
        candidates
            .filter { StuckPublicationRule.isRecoverable(it.state, nowMillis - it.createdAtMillis, hasVoice = false) }
            .maxByOrNull { it.createdAtMillis }
            ?.takeIf { !it.hasVoice }

    /**
     * La classification est conservée : un POST qui portait un média reste un POST. Un REEL n'est jamais cru sur
     * parole — le composer recalcule son type depuis les médias restaurés ([ReelComposition.defaultType]), de sorte
     * qu'un réel périmé à une seule image repart en POST.
     */
    fun forcePlainPost(storedType: String?): Boolean = storedType == POST

    private const val POST = "POST"
}
