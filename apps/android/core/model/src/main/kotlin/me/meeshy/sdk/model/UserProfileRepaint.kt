package me.meeshy.sdk.model

/**
 * UN PORTRAIT ET UN NOM, PARTOUT OÙ UNE COPIE LES GARDE — la loi unique qui repeint un pair quand la
 * passerelle annonce `user:updated`. Miroir de `UserProfileRepaint.swift` (iOS) et de `repaintProfile` (web).
 *
 * - Une copie DÉSIGNE le pair par son identifiant d'UTILISATEUR, jamais par son pseudo (qui change
 *   justement) : une copie sans id gravé garde son nom.
 * - Le nom voyage en groupe ([UserUpdatedEvent.hasNameGroup]) ; une ligne de participant ou un expéditeur
 *   porte le nom COMPOSÉ, un objet compte porte `displayName` tel que servi (effacé, il reste effacé).
 * - Le portrait est tri-état (voir [UserUpdatedEvent.OptionalMediaChange]).
 * - Chaque fonction rend `null` quand rien ne change : l'appelant ne republie pas une copie intacte.
 */
fun UserUpdatedEvent.repainted(participant: PaginatedParticipant): PaginatedParticipant? {
    if (participant.userId != userId) return null
    val next = participant.copy(
        username = if (hasNameGroup) username else participant.username,
        firstName = if (hasNameGroup) firstName else participant.firstName,
        lastName = if (hasNameGroup) lastName else participant.lastName,
        displayName = if (hasNameGroup) composedName else participant.displayName,
        avatar = avatar.applied(participant.avatar),
    )
    return next.takeIf { it != participant }
}

fun UserUpdatedEvent.repainted(participant: ApiParticipant): ApiParticipant? {
    if (participant.userId != userId) return null
    val next = participant.copy(
        username = if (hasNameGroup) username else participant.username,
        displayName = if (hasNameGroup) composedName else participant.displayName,
        avatar = avatar.applied(participant.avatar),
    )
    return next.takeIf { it != participant }
}

/** Un expéditeur (message, citation, transféré) : nom composé, et le compte imbriqué suit pour ne rien ressusciter. */
fun UserUpdatedEvent.repainted(sender: ApiMessageSender): ApiMessageSender? {
    if (sender.resolvedUserId != userId) return null
    val nested = sender.user?.let { user ->
        user.copy(
            username = if (hasNameGroup) username else user.username,
            displayName = if (hasNameGroup) composedName else user.displayName,
            firstName = if (hasNameGroup) firstName else user.firstName,
            lastName = if (hasNameGroup) lastName else user.lastName,
            avatar = avatar.applied(user.avatar),
        )
    }
    val next = sender.copy(
        username = if (hasNameGroup) username else sender.username,
        displayName = if (hasNameGroup) composedName else sender.displayName,
        firstName = if (hasNameGroup) firstName else sender.firstName,
        lastName = if (hasNameGroup) lastName else sender.lastName,
        avatar = avatar.applied(sender.avatar),
        user = nested,
    )
    return next.takeIf { it != sender }
}

/** Applique [rule] ligne à ligne ; `null` quand aucune ne change. Ordre conservé, éléments intacts partagés. */
fun <T> List<T>.repaintedElements(rule: (T) -> T?): List<T>? {
    var changed = false
    val result = map { element ->
        val next = rule(element)
        if (next == null) element else { changed = true; next }
    }
    return result.takeIf { changed }
}
