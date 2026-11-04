package me.meeshy.sdk.model.fullscreen

/**
 * **Ce que démarrer une page du plein écran fait au lecteur partagé** (les trois branches de `playThroughCoordinator`,
 * `AudioFullscreenPage.swift`). Dans les trois cas, la suite posée est celle du plein écran — l'ordre de réception.
 */
public object AudioFullscreenStart {

    public enum class Step {
        /** La page est déjà la piste active : rien ne se relance, seule la suite change. */
        ALREADY_ACTIVE,

        /** Une autre page de la MÊME conversation joue : la tête bascule, la session (nom, pochette, accent) reste. */
        KEEP_SESSION,

        /** Rien ne joue, ou une autre conversation : une nouvelle session s'ouvre. */
        NEW_SESSION,
    }

    public fun step(
        pageAttachmentId: String,
        activeAttachmentId: String?,
        activeConversationId: String?,
        pageConversationId: String?,
    ): Step = when {
        activeAttachmentId == pageAttachmentId -> Step.ALREADY_ACTIVE
        activeConversationId != null && !pageConversationId.isNullOrEmpty() && activeConversationId == pageConversationId ->
            Step.KEEP_SESSION
        else -> Step.NEW_SESSION
    }
}
