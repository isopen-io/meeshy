package me.meeshy.sdk.model.profile

/** Une conversation commune, réduite à ce que la demande d'appel lit. */
data class ProfileSharedConversation(
    val id: String,
    val isDirect: Boolean,
    val peerUserId: String?,
)

/** Miroir de `ProfileCallRequest.swift`. */
data class ProfileCallRequest(
    val userId: String,
    val displayName: String,
    val isVideo: Boolean,
    val conversationId: String?,
) {
    companion object {
        /** `null` pour un userId vide ou blanc ; la conversation est la première directe dont le pair est nul ou égal à userId. */
        fun of(
            userId: String?,
            displayName: String,
            isVideo: Boolean,
            sharedConversations: List<ProfileSharedConversation>,
        ): ProfileCallRequest? {
            val id = userId?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            val direct = sharedConversations.firstOrNull {
                it.isDirect && (it.peerUserId == null || it.peerUserId == id)
            }
            return ProfileCallRequest(id, displayName, isVideo, direct?.id)
        }
    }
}
