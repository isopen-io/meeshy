package me.meeshy.app.navigation

import me.meeshy.sdk.model.call.WaitingCall
import me.meeshy.sdk.model.link.EmailLinkSecret
import me.meeshy.sdk.model.push.PushPayload
import me.meeshy.sdk.model.push.PushTapDestination
import me.meeshy.app.navigation.graph.GameRoutes

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
    /** Les clés `data` du push touché (type, postId, senderId…) : la table [PushTapDestination] les lit. */
    val tap: PushPayload = PushPayload(),
    /** Indice de route de la passerelle (`progression`) : un nom d'écran, jamais une adresse. */
    val routeHint: String? = null,
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
        else -> tapRoute(extras)
    }

    /**
     * Le toucher d'une notification : la table type -> destination d'iOS ([PushTapDestination]).
     * Une charge sans type mais avec une conversation (anciennes notifications posees avant les
     * extras du toucher) ouvre toujours sa conversation.
     */
    private fun tapRoute(extras: LaunchExtras): String? {
        val payload = extras.tap.copy(conversationId = extras.conversationId?.takeIf { it.isNotBlank() } ?: extras.tap.conversationId)
        return when (val destination = PushTapDestination.resolve(payload, extras.routeHint)) {
            is PushTapDestination.Conversation -> Routes.chat(destination.conversationId, destination.highlightMessageId)
            is PushTapDestination.Post -> Routes.postDetail(destination.postId)
            is PushTapDestination.Reel -> Routes.reels(destination.postId)
            is PushTapDestination.Story -> Routes.story(destination.userId)
            is PushTapDestination.Mood -> Routes.moodSpotlight(destination.statusId)
            is PushTapDestination.Profile -> Routes.profile(destination.userId)
            PushTapDestination.Notifications -> Routes.NOTIFICATIONS
            is PushTapDestination.Game -> GameRoutes.route(destination.target)
            PushTapDestination.None -> null
        }
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

    /** Seules origines dont un lien d'e-mail ouvre une session : `meeshy.me` et `www.meeshy.me`, les deux hotes que le
     *  manifeste revendique (App Link verifie) — comme `DeepLinkRouter.meeshyHosts` d'iOS. Un hote revendique mais non lu
     *  avalait le lien sans rien afficher (#13465). Le port par defaut est admis ; un hote qui ne fait que commencer comme
     *  `meeshy.me` ne l'est pas. */
    private val MEESHY_ORIGIN = Regex("^https://(?:www\\.)?meeshy\\.me(?::443)?(?=[/?#]|\\z)", RegexOption.IGNORE_CASE)

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
     * `verify-email` (jeton ET adresse, tous deux requis) mene a la preuve de l'adresse, et
     * `reset-password` (`/reset-password`, `/auth/reset-password` et l'alias `/auth/email-link/…`)
     * a « Nouveau mot de passe » : meme forme exacte, memes refus, meme jeton laisse encode.
     * Sans son secret, un de ces liens n'ouvre rien.
     *
     * Le token reste ENCODE tel quel dans la route produite : l'argument de
     * navigation le decode une seule fois a l'arrivee — le decoder ici le ferait
     * decoder deux fois et casserait tout token contenant `%` ou `+`.
     */
    fun routeForDeepLink(dataUri: String?): String? {
        if (dataUri == null || !MEESHY_ORIGIN.containsMatchIn(dataUri)) return null
        return when (val form = EmailLinkSecret.exactForm(dataUri)) {
            is EmailLinkSecret.Form.MagicLink ->
                (form.pathToken ?: linkSecret(name = "token", uri = dataUri))?.let { "auth/magic-link?token=$it" }
            EmailLinkSecret.Form.ResetPassword ->
                linkSecret(name = "token", uri = dataUri)?.let(Routes::resetPassword)
            EmailLinkSecret.Form.VerifyEmail -> {
                val token = linkSecret(name = "token", uri = dataUri) ?: return null
                val email = linkSecret(name = "email", uri = dataUri) ?: return null
                Routes.verifyEmailLink(token = token, email = email)
            }
            null -> null
        }
    }

    /**
     * Cette destination de lancement s'ouvre-t-elle HORS session ? Seuls les liens d'e-mail a jeton : c'est
     * precisement eux qui ouvrent une session (connexion, adresse prouvee) ou choisissent un mot de passe.
     * Tout le reste (chat, appel) attend l'authentification.
     */
    fun opensWithoutSession(route: String?): Boolean =
        route != null && EMAIL_LINK_ROUTE_PREFIXES.any { route.startsWith(it) }

    /**
     * La route de lancement lue dans `onCreate`. Une activité RESTAURÉE (mort du processus) ou RECRÉÉE (thème, langue,
     * densité) reçoit l'intent ORIGINAL, adresse et extras intacts : vider `intent.data` n'avait vidé que la copie locale.
     * Une route à jeton d'e-mail relue là rejouerait un lien déjà présenté, et une route d'appel redécrocherait (#13504)
     * un appel de groupe que l'utilisateur a quitté et qui dure encore ; les deux sont ignorées — la pile restaurée
     * montre déjà son écran.
     */
    fun onCreateRoute(route: String?, restored: Boolean): String? =
        route.takeUnless { restored && (opensWithoutSession(it) || CallRoute.isCallRoute(it)) }

    private val EMAIL_LINK_ROUTE_PREFIXES =listOf("auth/magic-link", "auth/reset-password", "auth/verify-email")

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
