package me.meeshy.sdk.model.fullscreen

public object AudioFullscreenStart {
    public enum class Step { ALREADY_ACTIVE, KEEP_SESSION, NEW_SESSION }

    public fun step(
        pageAttachmentId: String,
        activeAttachmentId: String?,
        activeConversationId: String?,
        pageConversationId: String?,
    ): Step = Step.NEW_SESSION
}
