package me.meeshy.sdk.model.profile

/** « Est-ce moi ? » — par id OU par pseudo ; une session sans id reconnaît personne. */
object ProfileSelfRule {
    fun isSelf(
        sessionUserId: String?,
        sessionUsername: String?,
        userId: String?,
        username: String,
    ): Boolean {
        if (sessionUserId.isNullOrEmpty()) return false
        if (userId == sessionUserId) return true
        return !sessionUsername.isNullOrEmpty() && username == sessionUsername
    }

    fun isSelf(sessionUserId: String?, sessionUsername: String?, user: ProfileSheetUser): Boolean =
        isSelf(sessionUserId, sessionUsername, user.userId, user.username)
}
