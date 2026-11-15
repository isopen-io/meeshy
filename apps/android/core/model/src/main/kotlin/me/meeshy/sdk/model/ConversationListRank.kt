package me.meeshy.sdk.model

/**
 * Le RANG de la ligne dans la liste, en millisecondes (iOS `listActivityAt`) : max du dernier message
 * et du `listRankAt` servi (#9026, le même pour tous), relevé de la dernière réaction quand elle vise un
 * message du lecteur (#7548). Sans rien de tout cela : `updatedAt`, puis `createdAt`. `lastMessageAt`
 * reste la date AFFICHÉE ; l'ORDRE suit ce rang.
 */
fun ApiConversation.listRankAt(readerId: String?): Long {
    val served = listOfNotNull(
        isoToEpochMillisOrNull(lastMessage?.createdAt),
        isoToEpochMillisOrNull(listRankAt),
    ).maxOrNull() ?: isoToEpochMillisOrNull(updatedAt) ?: isoToEpochMillisOrNull(createdAt) ?: 0L
    val reaction = lastReaction ?: return served
    if (readerId.isNullOrEmpty() || !reaction.targets(readerId)) return served
    val at = isoToEpochMillisOrNull(reaction.createdAt) ?: return served
    return maxOf(served, at)
}
