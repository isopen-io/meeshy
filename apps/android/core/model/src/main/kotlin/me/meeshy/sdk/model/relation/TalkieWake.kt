package me.meeshy.sdk.model.relation

/**
 * LE RÉVEIL DU TALKIE (#17141, #17144) — un Proche parle pendant que Meeshy dort sur cet appareil. La passerelle garde
 * ses fragments en mémoire, pousse UN FCM data haute priorité `talkie_incoming`, puis rejoue tout dans l'ordre à
 * l'appareil qui émet `talkie:join { talkieId }` (fenêtre de rattrapage : 60 s après la fin). `title` et `body` sont
 * LOCALISÉS par la passerelle quand elle les sert ; nuls, l'appareil rend « X vous parle » avec le nom servi.
 */
public data class TalkieWakePush(
    val talkieId: String,
    val fromUserId: String,
    val fromName: String?,
    val title: String?,
    val body: String?,
    /**
     * L'audio porté par le push (`audioUrl`, HTTPS seulement) : « Lire » le joue avec le lecteur des vocaux existant,
     * sans ouvrir l'app. Absent, « Lire » redemande le rattrapage par la socket (`talkie:join`).
     */
    val audioUrl: String? = null,
    /**
     * Le push de SUIVI (`phase: 'ended'`) : la prise de parole a fini sans que personne la rejoigne, et la voix gardée
     * voyage en pièce jointe (`attachmentUrl`). Il remplace la bannière, ne réveille rien, et « Lire » la joue.
     */
    val ended: Boolean = false,
) {
    /** La clé de redélivrance : le réveil et son suivi sont deux pushes distincts du même `talkieId`. */
    public val deliveryKey: String get() = if (ended) "$talkieId$ENDED_SUFFIX" else talkieId

    /** Le titre affiché : celui de la passerelle, sinon « X vous parle » (nom servi, ou « Quelqu'un »). */
    public fun displayTitle(fallback: (String) -> String, someone: String): String = title ?: fallback(fromName ?: someone)

    /**
     * L'audio que « Lire » a le droit de jouer : seulement s'il vient de la PASSERELLE configurée ([gateway], même
     * schéma, hôte et port) — une autre origine ferait jouer une fausse voix d'urgence. `null` ⇒ rattrapage par la socket.
     */
    public fun playableAudio(gateway: String): String? {
        val audio = audioUrl?.let(::originOf) ?: return null
        return audioUrl.takeIf { audio == originOf(gateway) }
    }

    private companion object {
        const val ENDED_SUFFIX = "#ended"
    }

    private fun originOf(url: String): String? = runCatching {
        val uri = java.net.URI(url)
        val scheme = uri.scheme?.lowercase() ?: return null
        val host = uri.host?.lowercase() ?: return null
        val port = if (uri.port == -1 && scheme == "https") 443 else uri.port
        "$scheme://$host:$port"
    }.getOrNull()
}

/** Ce que le service FCM fait d'un push : exactement une issue, jamais d'exception. */
public sealed interface TalkieWakeRoute {
    public data object NotATalkieWake : TalkieWakeRoute

    public data class Wake(val push: TalkieWakePush) : TalkieWakeRoute

    public data class Ignore(val reason: Reason) : TalkieWakeRoute

    public enum class Reason { MALFORMED, DUPLICATE }
}

/**
 * La loi PURE du push de réveil : un `talkie_incoming` complet réveille UNE fois — une redélivrance FCM du même
 * `talkieId` ([alreadyWoken]) ne relance rien. Le client ne rejuge aucune règle (niveau, réception coupée, E2EE, appel,
 * Ne pas déranger) : la passerelle a jugé avant de pousser.
 */
public object TalkieWakePushRouter {

    public const val TYPE: String = "talkie_incoming"

    public fun route(data: Map<String, String>, alreadyWoken: (String) -> Boolean = { false }): TalkieWakeRoute {
        if (data["type"] != TYPE) return TalkieWakeRoute.NotATalkieWake
        val talkieId = data["talkieId"].nonBlank()
        val fromUserId = data["fromUserId"].nonBlank()
        if (talkieId == null || fromUserId == null) return TalkieWakeRoute.Ignore(TalkieWakeRoute.Reason.MALFORMED)
        val ended = data["phase"] == ENDED_PHASE
        val push = TalkieWakePush(
            talkieId = talkieId,
            fromUserId = fromUserId,
            fromName = (data["fromName"] ?: data["senderName"]).nonBlank(),
            title = data["title"].nonBlank(),
            body = data["body"].nonBlank(),
            audioUrl = audioOf(data, ended),
            ended = ended,
        )
        if (alreadyWoken(push.deliveryKey)) return TalkieWakeRoute.Ignore(TalkieWakeRoute.Reason.DUPLICATE)
        return TalkieWakeRoute.Wake(push)
    }

    /** Le suivi porte la voix en pièce jointe (`attachmentUrl`) ; le réveil en direct, sa capacité `audioUrl`. */
    private fun audioOf(data: Map<String, String>, ended: Boolean): String? {
        val candidates = if (ended) listOf(data["attachmentUrl"], data["audioUrl"]) else listOf(data["audioUrl"])
        return candidates.firstNotNullOfOrNull { it.nonBlank()?.takeIf { url -> url.startsWith("https://") } }
    }

    private const val ENDED_PHASE = "ended"

    private fun String?.nonBlank(): String? = this?.trim()?.takeIf { it.isNotEmpty() }
}

/** Où en est la prise de parole qui a réveillé l'appareil, lue sur l'état du talkie reçu ([TalkieFloorState]). */
public enum class TalkieWakeProgress {
    /** Pas encore rejouée : la socket se connecte, `talkie:join` n'a pas encore rendu l'annonce. */
    WAITING,

    /** Elle sort : sa voix joue. */
    PLAYING,

    /** Close (`talkie:ended`, « Couper », échéance) : le réveil a fini son travail. */
    DONE,
    ;

    public companion object {
        /**
         * Le temps que le réveil attend une annonce qui n'arrive pas (socket qui ne se connecte pas, rattrapage déjà
         * expiré) : la durée maximale d'une prise de parole, plus sa marge — au-delà, plus rien ne peut sortir.
         */
        public const val JOIN_TIMEOUT_MS: Long = TalkieContract.MAX_DURATION_MS + TALKIE_EXPIRY_GRACE_MS + 12_000L

        /** Le temps laissé à la file pour finir de sonner après la fin servie, avant que le service ne s'arrête. */
        public const val DRAIN_GRACE_MS: Long = 2_500L

        public fun of(floor: TalkieFloorState, talkieId: String): TalkieWakeProgress = when {
            floor.active.any { it.talkieId == talkieId } -> PLAYING
            talkieId in floor.closed -> DONE
            else -> WAITING
        }
    }
}
