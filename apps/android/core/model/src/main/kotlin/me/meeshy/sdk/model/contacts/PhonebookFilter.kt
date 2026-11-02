package me.meeshy.sdk.model.contacts

import java.text.Normalizer

/**
 * Filtre et recherche locales du repertoire (miroir de `PhonebookViewModel.recomputeDerived`).
 * Le repertoire est deja en memoire : aucun aller-retour par frappe. La recherche est
 * insensible a la casse et aux accents, sur nom, pseudo, e-mails et numeros.
 */
object PhonebookFilter {
    /** Sous ce seuil, une recherche plateforme ramenerait la moitie de l'annuaire. */
    const val PLATFORM_RELAY_MIN_QUERY = 2

    fun meeshyCount(contacts: List<DirectoryContact>): Int = contacts.count { it.isOnMeeshy }

    fun visible(contacts: List<DirectoryContact>, filter: DirectoryFilter, query: String): List<DirectoryContact> {
        val byFilter = when (filter) {
            DirectoryFilter.All -> contacts
            DirectoryFilter.Meeshy -> contacts.filter { it.isOnMeeshy }
            DirectoryFilter.Invitable -> contacts.filter { !it.isOnMeeshy }
        }
        val needle = fold(query.trim())
        if (needle.isEmpty()) return byFilter
        return byFilter.filter { matches(it, needle) }
    }

    /** Le relais plateforme ne prend la main que lorsque le repertoire n'a rien repondu. */
    fun showsPlatformResults(query: String, visible: List<DirectoryContact>): Boolean =
        query.trim().length >= PLATFORM_RELAY_MIN_QUERY && visible.isEmpty()

    /** Les resultats plateforme, soi exclu. */
    fun <T> excludingSelf(results: List<T>, selfId: String, idOf: (T) -> String): List<T> =
        results.filter { idOf(it) != selfId }

    private fun matches(contact: DirectoryContact, needle: String): Boolean =
        fold(contact.resolvedName).contains(needle) ||
            contact.matchedUser?.username?.let { fold(it).contains(needle) } == true ||
            contact.usernames.any { fold(it).contains(needle) } ||
            contact.emails.any { fold(it).contains(needle) } ||
            contact.phoneNumbers.any { fold(it).contains(needle) }

    private fun fold(text: String): String =
        Normalizer.normalize(text, Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
            .lowercase()
}
