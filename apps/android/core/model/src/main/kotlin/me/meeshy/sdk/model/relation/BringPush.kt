package me.meeshy.sdk.model.relation

import java.time.Instant

/**
 * Une sonnerie de Bring reçue par push (#13936, `proche-bring@android`) — la charge `bringPushDataSchema` de
 * `packages/shared/types/bring.ts`. `title`, `body` et `stopLabel` sont LOCALISÉS par la passerelle dans la langue du
 * destinataire ; nuls, le client rend les siens. `fromName` vide = le destinataire masque le nom de l'expéditeur.
 */
data class BringRingPush(
    val bringId: String,
    val fromUserId: String,
    val fromName: String?,
    val title: String?,
    val body: String?,
    val stopLabel: String?,
    val expiresAtMillis: Long,
) {
    /**
     * Ce que l'écran et la notification disent : les libellés servis par la passerelle (Prisme, langue du destinataire),
     * sinon ceux de l'appareil — le nom de l'expéditeur, ou « Quelqu'un » quand il est masqué.
     */
    fun texts(fallback: BringRingFallbackTexts): BringRingTexts = BringRingTexts(
        title = title ?: fallback.title(fromName ?: fallback.someone),
        body = body ?: fallback.body,
        stopLabel = stopLabel ?: fallback.stop,
    )
}

/** Les libellés de l'appareil (`bring.incoming.*` du catalogue iOS, adoptés par Android). */
data class BringRingFallbackTexts(
    val title: (String) -> String,
    val someone: String,
    val body: String,
    val stop: String,
)

data class BringRingTexts(val title: String, val body: String, val stopLabel: String)

/** Ce que le service FCM fait d'un push : exactement une issue, jamais d'exception. */
sealed interface BringPushRoute {
    data object NotABringPush : BringPushRoute
    data class Ring(val push: BringRingPush) : BringPushRoute
    data class Stop(val bringId: String) : BringPushRoute
    data class Ignore(val reason: Reason) : BringPushRoute

    enum class Reason { MALFORMED, EXPIRED, DUPLICATE, ALREADY_STOPPED }
}

/**
 * Ce que l'appareil a déjà vu : une sonnerie (une redélivrance FCM ne relance pas le son) ou un arrêt (l'ordre FCM
 * n'est pas garanti — un arrêt arrivé AVANT sa sonnerie la fait taire). Immuable, borné : une entrée vit deux
 * fenêtres de sonnerie, au-delà aucune livraison de ce Bring ne peut plus sonner (son expiration est passée).
 */
class BringRingLedger private constructor(private val entries: Map<String, Entry>) {

    private data class Entry(val stopped: Boolean, val atMillis: Long)

    val size: Int get() = entries.size

    fun remember(bringId: String, nowMillis: Long): BringRingLedger = put(bringId, Entry(stopped = false, atMillis = nowMillis), nowMillis)

    fun stop(bringId: String, nowMillis: Long): BringRingLedger = put(bringId, Entry(stopped = true, atMillis = nowMillis), nowMillis)

    internal fun seen(bringId: String, nowMillis: Long): BringPushRoute.Reason? {
        val entry = entries[bringId]?.takeIf { nowMillis - it.atMillis < RETENTION_MS } ?: return null
        return if (entry.stopped) BringPushRoute.Reason.ALREADY_STOPPED else BringPushRoute.Reason.DUPLICATE
    }

    internal fun pruned(nowMillis: Long): BringRingLedger =
        BringRingLedger(entries.filterValues { nowMillis - it.atMillis < RETENTION_MS })

    private fun put(bringId: String, entry: Entry, nowMillis: Long): BringRingLedger {
        val kept = pruned(nowMillis).entries
        val merged = if (kept[bringId]?.stopped == true) kept else kept + (bringId to entry)
        return BringRingLedger(merged)
    }

    companion object {
        val EMPTY = BringRingLedger(emptyMap())
        private const val RETENTION_MS = 2 * BringPushRouter.RING_WINDOW_MS
    }
}

data class BringPushDecision(val route: BringPushRoute, val ledger: BringRingLedger)

/**
 * La loi PURE du Bring reçu : un push `bring` sonne une fois, le temps que le serveur lui a donné — jamais au-delà de la fenêtre
 * (`BRING_RING_WINDOW_MS`), même si la charge le demande ; un push `bring_stopped` arrête et s'inscrit au registre.
 */
object BringPushRouter {

    const val TYPE_RING = "bring"
    const val TYPE_STOPPED = "bring_stopped"

    /** `BRING_RING_WINDOW_MS` de `packages/shared/types/bring.ts`. */
    const val RING_WINDOW_MS = 120_000L

    fun route(data: Map<String, String>, nowMillis: Long, ledger: BringRingLedger): BringPushDecision = when (data["type"]) {
        TYPE_STOPPED -> stopped(data, nowMillis, ledger)
        TYPE_RING -> ring(data, nowMillis, ledger)
        else -> BringPushDecision(BringPushRoute.NotABringPush, ledger)
    }

    private fun stopped(data: Map<String, String>, nowMillis: Long, ledger: BringRingLedger): BringPushDecision {
        val bringId = data["bringId"].nonBlank()
            ?: return BringPushDecision(BringPushRoute.Ignore(BringPushRoute.Reason.MALFORMED), ledger)
        return BringPushDecision(BringPushRoute.Stop(bringId), ledger.stop(bringId, nowMillis))
    }

    private fun ring(data: Map<String, String>, nowMillis: Long, ledger: BringRingLedger): BringPushDecision {
        val bringId = data["bringId"].nonBlank()
        val fromUserId = data["fromUserId"].nonBlank()
        if (bringId == null || fromUserId == null) {
            return BringPushDecision(BringPushRoute.Ignore(BringPushRoute.Reason.MALFORMED), ledger)
        }
        ledger.seen(bringId, nowMillis)?.let { return BringPushDecision(BringPushRoute.Ignore(it), ledger) }
        val ringFor = ringDurationOf(sentAt = data["sentAt"], expiresAt = data["expiresAt"])
        if (ringFor <= 0L) return BringPushDecision(BringPushRoute.Ignore(BringPushRoute.Reason.EXPIRED), ledger)
        val expiresAt = nowMillis + ringFor
        val push = BringRingPush(
            bringId = bringId,
            fromUserId = fromUserId,
            fromName = data["fromName"].nonBlank(),
            title = data["title"].nonBlank(),
            body = data["body"].nonBlank(),
            stopLabel = data["stopLabel"].nonBlank(),
            expiresAtMillis = expiresAt,
        )
        return BringPushDecision(BringPushRoute.Ring(push), ledger.remember(bringId, nowMillis))
    }

    /**
     * La DURÉE de sonnerie, lue sur les deux horloges du SERVEUR (`expiresAt − sentAt`) et comptée à la réception :
     * l'horloge de l'appareil n'entre jamais dans la décision. Un téléphone qui avance de cinq minutes sonne quand même
     * — une urgence perdue sans un signe serait le pire défaut. Le TTL FCM écarte déjà une livraison trop tardive.
     * Bornée à la fenêtre ; une charge illisible sonne la fenêtre entière.
     */
    private fun ringDurationOf(sentAt: String?, expiresAt: String?): Long {
        val sent = sentAt.epochMillisOrNull()
        val expires = expiresAt.epochMillisOrNull()
        if (sent == null || expires == null) return RING_WINDOW_MS
        return minOf(expires - sent, RING_WINDOW_MS)
    }

    private fun String?.epochMillisOrNull(): Long? = this?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

    private fun String?.nonBlank(): String? = this?.trim()?.takeIf { it.isNotEmpty() }
}
