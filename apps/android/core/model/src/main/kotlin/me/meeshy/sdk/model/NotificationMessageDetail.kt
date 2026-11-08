package me.meeshy.sdk.model

/**
 * Le DÉTAIL d'un message notifié (iOS `NotificationMessageDetail`, contrat #8856) : ce qu'un
 * message sans texte « lisible » transporte — une position, une carte de visite, une invitation,
 * un lien. Les clés sont lues dans `context` puis `metadata` ([ApiNotification.detailField]) ; les
 * nombres voyagent en CHAÎNES.
 *
 * **Aucune garde de protection dans [of]** : le serveur retient déjà ces clés pour un message
 * éphémère, à vue unique, flouté ou chiffré, et [ofUnprotected] pose le SECOND verrou — un
 * `notificationLocKey` posé est une DÉCLARATION de protection, jamais un indice.
 */
public sealed interface NotificationMessageDetail {

    public data class Location(
        val latitude: Double,
        val longitude: Double,
        val name: String?,
        val address: String?,
    ) : NotificationMessageDetail

    public data class Contact(val name: String, val phone: String?, val email: String?) : NotificationMessageDetail

    public data class Invite(
        val url: String,
        val conversationTitle: String?,
        val memberCount: Int?,
    ) : NotificationMessageDetail

    public data class Link(
        val url: String,
        val domain: String,
        val title: String?,
        val imageUrl: String?,
    ) : NotificationMessageDetail

    /** Les libellés que la composition ne peut pas inventer — résolus par la couche UI. */
    public data class Labels(val sharedLocation: String, val invitation: String)

    /** Le corps détaillé : `📍 Nom · adresse`, `👤 Nom`, `✉️ Invitation · Titre`, `🔗 domaine — titre`. */
    public fun summary(labels: Labels): String = when (this) {
        is Location -> "📍 " + listOfNotNull(name, address).joinToString(" · ").ifEmpty { labels.sharedLocation }
        is Contact -> "👤 $name"
        is Invite -> "✉️ " + listOfNotNull(labels.invitation, conversationTitle).joinToString(" · ")
        is Link -> "🔗 " + listOfNotNull(domain, title).joinToString(" — ")
    }

    /**
     * Le corps servi mérite-t-il d'être remplacé par [summary] ? Oui s'il est VIDE ou s'il n'est que
     * l'URL brute de l'invitation / du lien. Un corps composé par la passerelle, ou écrit par un
     * humain, est gardé.
     */
    public fun shouldReplace(body: String?): Boolean {
        val served = body.nonBlankDetail() ?: return true
        return when (this) {
            is Invite -> isBare(served, url)
            is Link -> isBare(served, url)
            is Location, is Contact -> false
        }
    }

    /** Le corps à AFFICHER : le corps servi, sauf s'il doit céder au résumé. */
    public fun resolvedBody(served: String?, labels: Labels): String? =
        if (shouldReplace(served)) summary(labels) else served.nonBlankDetail()

    public companion object {
        /** Les clés du contrat, dans l'ordre où la charge les porte. */
        public val WIRE_KEYS: List<String> = listOf(
            "locationLat", "locationLon", "locationName", "locationAddress",
            "contactName", "contactPhone", "contactEmail",
            "inviteUrl", "inviteConversationTitle", "inviteMemberCount",
            "linkUrl", "linkDomain", "linkTitle", "linkImageUrl",
            "thumbnailUrl", "storyReply",
        )

        /** La clé qui DÉCLARE un message protégé (vue unique, éphémère, flouté, chiffré). */
        public const val PROTECTION_KEY: String = "notificationLocKey"

        /**
         * Priorité : position, contact, invitation, lien — du plus spécifique au plus générique. Une
         * invitation EST un lien ; la lire comme lien perdrait l'action « Rejoindre ».
         */
        public fun of(lookup: (String) -> String?): NotificationMessageDetail? {
            fun text(key: String): String? = lookup(key).nonBlankDetail()
            val lat = text("locationLat")?.toFiniteDouble()
            val lon = text("locationLon")?.toFiniteDouble()
            if (lat != null && lon != null && lat in -90.0..90.0 && lon in -180.0..180.0) {
                return Location(lat, lon, text("locationName"), text("locationAddress"))
            }
            text("contactName")?.let { return Contact(it, text("contactPhone"), text("contactEmail")) }
            text("inviteUrl")?.takeIf { hasScheme(it, "https", "http", "meeshy") }?.let {
                return Invite(it, text("inviteConversationTitle"), text("inviteMemberCount")?.toFiniteDouble()?.toInt())
            }
            text("linkUrl")?.takeIf { hasScheme(it, "https", "http") }?.let {
                return Link(it, text("linkDomain") ?: hostOf(it) ?: it, text("linkTitle"), text("linkImageUrl"))
            }
            return null
        }

        /** [of], sauf si le message DÉCLARE une protection : alors aucun détail ne voyage. */
        public fun ofUnprotected(lookup: (String) -> String?): NotificationMessageDetail? =
            if (declaresProtection(lookup)) null else of(lookup)

        public fun declaresProtection(lookup: (String) -> String?): Boolean =
            lookup(PROTECTION_KEY).nonBlankDetail() != null

        private fun hasScheme(raw: String, vararg schemes: String): Boolean {
            val scheme = raw.substringBefore(':', missingDelimiterValue = "").lowercase()
            return scheme in schemes && raw.length > scheme.length + 1
        }

        private fun hostOf(raw: String): String? =
            runCatching { java.net.URI(raw).host }.getOrNull()?.takeIf { it.isNotBlank() }

        private fun String.toFiniteDouble(): Double? = toDoubleOrNull()?.takeIf { it.isFinite() }

        private fun isBare(body: String, url: String): Boolean =
            strip(body) == strip(url)

        private fun strip(value: String): String = value.lowercase().trim('/', ' ')
    }
}

private fun String?.nonBlankDetail(): String? = this?.trim()?.takeIf { it.isNotEmpty() }
