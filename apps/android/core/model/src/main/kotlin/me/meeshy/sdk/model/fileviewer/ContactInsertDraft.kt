package me.meeshy.sdk.model.fileviewer

import me.meeshy.sdk.model.contacts.vcard.VCard

/**
 * Ce que « Ajouter aux contacts » remet à l'écran d'ajout du système (`ContactsContract.Intents.Insert`) :
 * l'écran système demande lui-même l'enregistrement, aucune autorisation d'accès au carnet n'est requise.
 * Le système n'accepte que deux numéros et un e-mail dans cet intent.
 */
data class ContactInsertDraft(
    val name: String?,
    val phones: List<String>,
    val email: String?,
    val company: String?,
    val jobTitle: String?,
    val notes: String?,
    val postal: String?,
) {
    companion object {
        private const val MAX_PHONES = 2

        fun of(card: VCard): ContactInsertDraft = ContactInsertDraft(
            name = card.displayName.takeIf { it.isNotEmpty() },
            phones = card.phones.map { it.value.trim() }.filter { it.isNotEmpty() }.take(MAX_PHONES),
            email = card.emails.firstOrNull()?.value?.trim()?.takeIf { it.isNotEmpty() },
            company = card.organization?.trim()?.takeIf { it.isNotEmpty() },
            jobTitle = card.title?.trim()?.takeIf { it.isNotEmpty() },
            notes = card.note?.trim()?.takeIf { it.isNotEmpty() },
            postal = card.addresses.firstOrNull()?.formatted?.takeIf { it.isNotEmpty() },
        )
    }
}
