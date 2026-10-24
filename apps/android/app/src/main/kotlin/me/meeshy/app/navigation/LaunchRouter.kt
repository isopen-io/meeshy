package me.meeshy.app.navigation

import me.meeshy.sdk.model.call.WaitingCall
import me.meeshy.sdk.model.link.EmailLinkSecret

/**
 * The primitive launch inputs a notification tap / full-screen call intent carries.
 * [MainActivity] extracts these from the Android `Intent` extras (thin, untestable
 * platform glue) and hands them to the pure [LaunchRouter], which owns the decision.
 *
 * Keys mirror the extras [me.meeshy.app.push.MeeshyFcmService] sets:
 *  - a **call** full-screen intent carries [callId] / [conversationId] / [callerName] / [isVideo]
 *  - a **message** notification tap carries only [conversationId]
 *  - a cold/normal launch carries none.
 */
data class LaunchExtras(
    val callId: String? = null,
    val conversationId: String? = null,
    val callerName: String? = null,
    val isVideo: Boolean = false,
    /** Bouton « Répondre » de la notification CallStyle : décrocher directement. */
    val autoAnswer: Boolean = false,
)

/**
 * Pure single source of truth translating an app-launch's notification extras into
 * the deep-link route to navigate to, or `null` when nothing actionable is present
 * (the start destination stands). Shared plumbing for both notification kinds:
 *
 *  - a **call** push (non-blank [LaunchExtras.callId]) wins — a ringing call is the
 *    urgent, foreground-worthy intent — and deep-links into the incoming-call screen
 *    via [CallRoute.incoming], carrying the server id so the screen answers rather
 *    than re-initiates.
 *  - otherwise a bare non-blank [LaunchExtras.conversationId] opens that chat
 *    ([Routes.chat]) — the message-notification tap path.
 *  - everything else (both blank) yields `null`.
 *
 * Keeping the branch decision here (unit-tested) leaves the `MainActivity` /
 * `MeeshyApp` wiring a thin layer that only reads extras and calls `navigate`.
 */
object LaunchRouter {
    fun route(extras: LaunchExtras): String? = when {
        !extras.callId.isNullOrBlank() -> CallRoute.incoming(
            callId = extras.callId,
            conversationId = extras.conversationId.orEmpty(),
            callerName = extras.callerName.orEmpty(),
            isVideo = extras.isVideo,
            autoAnswer = extras.autoAnswer,
        )
        !extras.conversationId.isNullOrBlank() -> Routes.chat(extras.conversationId)
        else -> null
    }

    /**
     * Route a **socket-delivered** incoming-call offer — the foreground path, where
     * the app is open and the realtime socket (not FCM) carries `call:initiated`.
     * Rings by deep-linking into the incoming-call screen exactly like the push path
     * ([route]/[CallRoute.incoming]), reusing the same [LaunchExtras] plumbing.
     *
     * Gated on **not already being on the call screen**: a second offer arriving
     * mid-call is the call-waiting scenario, owned by `CallViewModel`'s banner, so
     * this yields `null` and leaves the active call screen in place. The offer's
     * [WaitingCall.callId] is always non-blank (the mapper drops idless frames), so
     * the produced route always adopts the server id — the screen answers rather
     * than re-initiates.
     */
    fun routeIncomingSocketOffer(offer: WaitingCall, currentRoute: String?): String? =
        if (currentRoute == CallRoute.PATTERN) {
            null
        } else {
            route(
                LaunchExtras(
                    callId = offer.callId,
                    conversationId = offer.conversationId,
                    callerName = offer.callerName,
                    isVideo = offer.isVideo,
                ),
            )
        }

    /** Seule origine dont un lien d'e-mail ouvre une session : l'origine https du lien du MAIL (App Link verifie).
     *  Le port par defaut est admis ; un hote qui ne fait que commencer comme `meeshy.me` ne l'est pas. */
    private val MEESHY_ORIGIN = Regex("^https://meeshy\\.me(?::443)?(?=[/?#]|\\z)", RegexOption.IGNORE_CASE)

    /**
     * Traduit l'URI d'un intent VIEW en route interne, ou `null` si l'URI ne nous
     * concerne pas. Seul le magic link passe par ici : les autres deep links
     * (join, chat, profil) sont matches par les `navDeepLink` du NavHost au
     * demarrage — le magic link ne peut PAS l'etre, car sa destination doit etre
     * atteignable HORS authentification et sur un intent chaud (`onNewIntent`).
     *
     * Un lien a jeton d'e-mail n'entre que par la FORME EXACTE qu'ecrit l'e-mail
     * ([EmailLinkSecret.exactForm], #10875) et sur l'origine https de Meeshy : jamais
     * par `meeshy://` (n'importe quelle page ou app ouvre ce scheme et y presenterait
     * le jeton d'un TIERS, #10873), jamais par une variante (segment en plus, espace,
     * `;`, encodage, invisible, casse, identifiants, port, http). Une variante part au
     * navigateur. Le jeton voyage dans le fragment (`#token=`), que le navigateur
     * n'envoie jamais au serveur ; la requete (`?token=`) reste lue pour les e-mails
     * partis avant, et le jeton historique ecrit dans le chemin aussi.
     *
     * `verify-email` et `reset-password` sont reconnus par la loi mais n'ont pas encore
     * de destination ici : ils ne donnent aucune route (l'e-mail s'ouvre au navigateur).
     *
     * Le token reste ENCODE tel quel dans la route produite : l'argument de
     * navigation le decode une seule fois a l'arrivee — le decoder ici le ferait
     * decoder deux fois et casserait tout token contenant `%` ou `+`.
     */
    fun routeForDeepLink(dataUri: String?): String? {
        if (dataUri == null || !MEESHY_ORIGIN.containsMatchIn(dataUri)) return null
        val form = EmailLinkSecret.exactForm(dataUri) as? EmailLinkSecret.Form.MagicLink ?: return null
        val token = form.pathToken ?: linkSecret(name = "token", uri = dataUri) ?: return null
        return "auth/magic-link?token=$token"
    }

    /** Le secret d'un lien d'e-mail : le fragment prime, la requete reste lue. Jamais decode ici. */
    private fun linkSecret(name: String, uri: String): String? {
        val fragment = uri.substringAfter('#', missingDelimiterValue = "")
        val query = uri.substringBefore('#').substringAfter('?', missingDelimiterValue = "")
        return listOf(fragment, query).firstNotNullOfOrNull { parameter(name, it) }
    }

    private fun parameter(name: String, encoded: String): String? =
        encoded.split('&')
            .firstOrNull { it.startsWith("$name=") }
            ?.removePrefix("$name=")
            ?.takeIf { it.isNotBlank() }
}
