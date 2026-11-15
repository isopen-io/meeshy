package me.meeshy.sdk.net

import me.meeshy.sdk.model.net.ClientCapabilities
import me.meeshy.sdk.model.net.ClientCapability
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Annonce à la passerelle ce que ce binaire sait lire.
 *
 * Sans cet en-tête, la passerelle traite le client comme un ancien : elle
 * remplace un canevas v3 par la sentinelle « Mets à jour Meeshy », et omet
 * carrément `storyEffects` quand le post porte un média (règle 5). Android ne
 * voyait donc jamais ses propres canevas.
 *
 * L'ordre est la seule chose qui rende cet en-tête sûr, et il n'est pas
 * négociable : il ne se pose qu'APRÈS que la lecture existe
 * (`StoryEffectsWireSerializer` → `StoryEffects.rendering`). Annoncer la
 * capacité d'abord aurait échangé une sentinelle parfaitement lisible — un
 * blob v1 volontairement bien formé pour les vieux décodeurs — contre un
 * écran vide : une panne muette au lieu d'une dégradation lisible.
 *
 * Un NIVEAU, pas un booléen : la passerelle compare `caps >= 3`
 * (`storyEffectsV3.ts:451`). C'est une constante du binaire — rien dans
 * l'environnement ne la fait varier — d'où sa place dans un intercepteur nu
 * plutôt que dans une configuration.
 */
class ClientCapabilitiesInterceptor(
    private val capabilities: List<ClientCapability> = ClientCapabilities.declared,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val builder = request.newBuilder()
        if (request.header(CANVAS_CAPS_HEADER) == null) builder.header(CANVAS_CAPS_HEADER, CANVAS_CAPS_LEVEL)
        val declared = ClientCapabilities.headerValue(capabilities)
        if (declared != null && request.header(ClientCapabilities.HEADER_NAME) == null) {
            builder.header(ClientCapabilities.HEADER_NAME, declared)
        }
        return chain.proceed(builder.build())
    }

    private companion object {
        const val CANVAS_CAPS_HEADER = "X-Canvas-Caps"
        const val CANVAS_CAPS_LEVEL = "3"
    }
}
