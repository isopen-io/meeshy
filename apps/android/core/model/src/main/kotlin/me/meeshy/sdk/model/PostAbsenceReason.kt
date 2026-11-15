package me.meeshy.sdk.model

/**
 * Pourquoi il n'y a rien a montrer sur le detail d'un post (miroir de iOS
 * `PostDetailAbsenceReason`). L'ORDRE des questions est la regle : 1) ai-je un post ?
 * 2) une tentative tourne-t-elle (sinon une cause ANCIENNE trancherait) ? 3) qu'a-t-il echoue ?
 */
enum class PostAbsenceReason {
    PRESENT,
    STILL_LOADING,
    UNAVAILABLE,
    NETWORK_FAILED,
    SERVER_FAILED,
    ;

    companion object {
        fun resolve(hasPost: Boolean, isLoading: Boolean, failure: ContentFetchFailure?): PostAbsenceReason = when {
            hasPost -> PRESENT
            isLoading -> STILL_LOADING
            failure == ContentFetchFailure.NETWORK -> NETWORK_FAILED
            failure == ContentFetchFailure.SERVER -> SERVER_FAILED
            else -> UNAVAILABLE
        }
    }
}
