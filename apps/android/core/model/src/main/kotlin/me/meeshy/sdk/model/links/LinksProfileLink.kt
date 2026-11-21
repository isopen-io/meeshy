package me.meeshy.sdk.model.links

import me.meeshy.sdk.model.ProfileShareLink

/**
 * Le billet « Mon lien de profil » de la face Liens : le lien canonique ([ProfileShareLink], le même que celui de la fiche — le
 * QR, le texte copié et le texte envoyé ne peuvent pas diverger), et sa forme montrée, sans schéma. `null` sans pseudo partageable.
 */
data class LinksProfileLink(val handle: String, val webLink: String, val shown: String) {
    companion object {
        fun from(username: String?): LinksProfileLink? {
            val handle = ProfileShareLink.canonicalUsername(username.orEmpty()) ?: return null
            val web = ProfileShareLink.webLink(username.orEmpty()) ?: return null
            return LinksProfileLink(handle = handle, webLink = web, shown = web.removePrefix("https://"))
        }
    }
}
