package me.meeshy.sdk.model.contacts

/**
 * Les textes d'invitation SMS (miroir de `PhonebookViewModel.invitationMessage` et de
 * `DiscoverViewModel.smsMessage`, iOS) : chaînes littérales, volontairement non localisées.
 */
object SmsInvite {
    const val DOWNLOAD_URL: String = "https://meeshy.me/download"

    const val generic: String = "Rejoins-moi sur Meeshy ! Telecharge l'app : $DOWNLOAD_URL"

    /** Le nom vide ou blanc retombe sur « Salut ! », comme iOS. */
    fun personalized(name: String): String {
        val trimmed = name.trim()
        val greeting = if (trimmed.isEmpty()) "Salut" else "Salut $trimmed"
        return "$greeting ! Rejoins-moi sur Meeshy : $DOWNLOAD_URL"
    }
}
