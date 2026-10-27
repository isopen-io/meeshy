package me.meeshy.app.chat.mediahub

import java.net.URI
import java.util.Locale
import me.meeshy.app.chat.ChatLinkLaunch
import me.meeshy.app.chat.chatLinkLaunchFor
import me.meeshy.sdk.model.mediahub.MediaHubPayload
import me.meeshy.sdk.model.mediahub.MediaHubRowExit

/**
 * Ce que devient l'appui sur une rangée du hub qui n'ouvre pas la visionneuse. Une adresse vient d'un MESSAGE, donc
 * d'un autre utilisateur : elle ne part jamais en `ACTION_VIEW` brut.
 */
internal sealed interface MediaHubLaunch {
    /** Un lien ou un lieu : le chemin des liens du fil ([chatLinkLaunchFor] / `openChatLink`), mêmes gardes. */
    data class ChatLink(val url: String) : MediaHubLaunch

    /**
     * Un fichier servi par la passerelle elle-même (https ; http seulement si la passerelle configurée l'est). Il ne
     * s'ouvre QUE par le circuit de téléchargement du fil (`FileAttachmentDownload`), jamais par une intention brute.
     */
    data class GatewayFile(val url: String, val mimeType: String?) : MediaHubLaunch

    /** Une vidéo de la passerelle : lue par le lecteur intégré de Meeshy, pas par l'application système. */
    data class Video(val url: String) : MediaHubLaunch

    /** Le portillon de sortie du porteur refuse : un contenu qui disparaît ne sort pas de Meeshy (#9573). */
    data object Refused : MediaHubLaunch

    /** Rien : pièce scellée, schéma refusé, ou adresse hors de la passerelle. */
    data object Ignored : MediaHubLaunch
}

/**
 * La décision PURE. [resolveMedia] rend chargeable l'adresse servie (clé, chemin) ; [apiBaseUrl] fixe la seule
 * origine d'où une pièce peut s'ouvrir.
 */
internal fun mediaHubLaunchFor(
    payload: MediaHubPayload,
    apiBaseUrl: String,
    resolveMedia: (String) -> String,
    exit: MediaHubRowExit,
): MediaHubLaunch = when (payload) {
    is MediaHubPayload.Link -> if (isHubLink(payload.url)) MediaHubLaunch.ChatLink(payload.url) else MediaHubLaunch.Ignored
    is MediaHubPayload.Place -> {
        val geo = "geo:${payload.latitude},${payload.longitude}?q=${payload.latitude},${payload.longitude}"
        if (chatLinkLaunchFor(geo) == ChatLinkLaunch.Ignored) MediaHubLaunch.Ignored else MediaHubLaunch.ChatLink(geo)
    }
    is MediaHubPayload.Attachment -> {
        val piece = payload.attachment
        val url = if (piece.isEncrypted || hasForeignScheme(piece.url)) null else resolveMedia(piece.url)
        when {
            url == null || !isGatewayMedia(url, apiBaseUrl) -> MediaHubLaunch.Ignored
            piece.isVideo -> MediaHubLaunch.Video(url)
            exit.mayLeave -> MediaHubLaunch.GatewayFile(url, piece.mimeType)
            else -> MediaHubLaunch.Refused
        }
    }
}

/**
 * Le hub n'extrait que des adresses web et `meeshy://` ; il n'ouvre rien d'autre, même si la politique du fil
 * confierait un schéma tiers (`intent:`, `market:`…) au système.
 */
private fun isHubLink(url: String): Boolean = when (val launch = chatLinkLaunchFor(url)) {
    is ChatLinkLaunch.InAppBrowser, is ChatLinkLaunch.BrowserOnly -> true
    is ChatLinkLaunch.External -> launch.url.startsWith(MEESHY_SCHEME, ignoreCase = true)
    ChatLinkLaunch.Ignored -> false
}

private const val MEESHY_SCHEME = "meeshy://"

private val SCHEME = Regex("^([a-zA-Z][a-zA-Z0-9+.\\-]*):")

/** Une adresse servie qui porte un schéma autre que http(s) n'est pas une clé : elle ne passe pas au résolveur. */
private fun hasForeignScheme(raw: String): Boolean {
    val scheme = SCHEME.find(raw.trim())?.groupValues?.get(1)?.lowercase(Locale.ROOT) ?: return false
    return scheme != "http" && scheme != "https"
}

private fun isGatewayMedia(url: String, apiBaseUrl: String): Boolean {
    val target = runCatching { URI(url) }.getOrNull() ?: return false
    val gateway = runCatching { URI(apiBaseUrl) }.getOrNull() ?: return false
    val scheme = target.scheme?.lowercase(Locale.ROOT) ?: return false
    val gatewayScheme = gateway.scheme?.lowercase(Locale.ROOT) ?: return false
    val schemeAllowed = scheme == "https" || (scheme == "http" && gatewayScheme == "http")
    return schemeAllowed &&
        target.userInfo == null &&
        target.host != null &&
        target.host.equals(gateway.host, ignoreCase = true) &&
        effectivePort(target) == effectivePort(gateway)
}

private fun effectivePort(uri: URI): Int = when {
    uri.port != -1 -> uri.port
    uri.scheme.equals("https", ignoreCase = true) -> 443
    else -> 80
}
