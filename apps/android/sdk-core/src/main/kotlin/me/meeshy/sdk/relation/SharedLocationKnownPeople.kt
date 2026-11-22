package me.meeshy.sdk.relation

import javax.inject.Inject
import me.meeshy.sdk.friend.AcceptedContactsSource
import me.meeshy.sdk.model.friend.resolvedName

/**
 * Les noms que l'appareil connaît DÉJÀ pour nommer ceux qui voient un point choisi (#20248, iso les amis en cache du web) :
 * le carnet d'amis gardé, sans requête. Une personne inconnue d'ici se compte, jamais ne se devine.
 */
fun interface SharedLocationKnownPeople {
    /** Des paires (identifiant, nom) ; vide quand le carnet n'a jamais été lu ou ne se lit pas. */
    suspend fun known(): List<Pair<String, String>>

    companion object {
        val NONE: SharedLocationKnownPeople = SharedLocationKnownPeople { emptyList() }
    }
}

/** Le carnet d'amis gardé ([AcceptedContactsSource.cached]) : jamais le réseau, pour une question posée à l'instant. */
class AcceptedContactsKnownPeople @Inject constructor(
    private val contacts: AcceptedContactsSource,
) : SharedLocationKnownPeople {
    override suspend fun known(): List<Pair<String, String>> =
        contacts.cached().orEmpty().map { it.id to it.resolvedName }
}
