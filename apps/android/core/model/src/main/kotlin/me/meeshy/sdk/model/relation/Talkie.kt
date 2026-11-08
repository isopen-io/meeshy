package me.meeshy.sdk.model.relation

import kotlinx.serialization.Serializable

/**
 * LE TALKIE (#13935, D-4, #13946) — un Proche appuie et parle, sa voix sort chez l'autre sans décrocher. Le contrat est
 * `packages/shared/types/talkie.ts` ; ce fichier en est la lecture Kotlin, côté RÉCEPTION (#16675), miroir de
 * `Relations/Talkie.swift` du SDK iOS. Le client ne recalcule AUCUNE règle (niveau, réception coupée, E2EE, appel, Ne pas
 * déranger) : la passerelle a jugé.
 */
public object TalkieContract {
    /** `TALKIE_MAX_DURATION_MS` : une prise de parole dure au plus 30 s. */
    public const val MAX_DURATION_MS: Long = 30_000L

    /** Le seul encodage relayé au MVP : celui du vocal (AAC mono, trames ADTS lisibles dès la première). */
    public const val CODEC: String = "aac-adts"
}

/** `talkie:incoming` — une prise de parole commence. Aucun nom ne voyage : l'écran l'hydrate par ses caches. */
@Serializable
public data class TalkieIncoming(
    val talkieId: String,
    val fromUserId: String,
    val codec: String = TalkieContract.CODEC,
    val startedAt: String? = null,
    val maxDurationMs: Long = TalkieContract.MAX_DURATION_MS,
) {
    /** Un encodage que ce client ne sait pas lire ne s'ouvre pas. */
    public val isPlayable: Boolean get() = codec == TalkieContract.CODEC

    /** La durée servie, bornée par le contrat : une valeur absurde ne garde jamais une prise de parole ouverte. */
    public val boundedDurationMs: Long get() = maxDurationMs.coerceIn(0L, TalkieContract.MAX_DURATION_MS)
}

/**
 * `talkie:chunk` — un fragment, à jouer DÈS son arrivée. Le son voyage en binaire Socket.IO natif, jamais en base64 : ce
 * type ne se décode donc pas par JSON, il se lit depuis la charge brute ([of]).
 */
public class TalkieChunk(
    public val talkieId: String,
    public val fromUserId: String,
    public val seq: Int,
    public val data: ByteArray,
) {
    override fun equals(other: Any?): Boolean = other is TalkieChunk &&
        talkieId == other.talkieId && fromUserId == other.fromUserId && seq == other.seq && data.contentEquals(other.data)

    override fun hashCode(): Int = listOf(talkieId, fromUserId, seq, data.contentHashCode()).hashCode()

    public companion object {
        /** Toute charge incomplète (identifiant vide, `seq` négatif, son absent ou vide) ⇒ `null`. */
        public fun of(talkieId: String?, fromUserId: String?, seq: Int?, data: ByteArray?): TalkieChunk? {
            if (talkieId.isNullOrEmpty() || fromUserId.isNullOrEmpty()) return null
            if (seq == null || seq < 0 || data == null || data.isEmpty()) return null
            return TalkieChunk(talkieId, fromUserId, seq, data)
        }
    }
}

/** `sender` : bouton relâché · `limit` : 30 s ou plafond atteint · `cut` : coupée (blocage, réglage, appel). */
public enum class TalkieEndReason(public val wire: String) {
    SENDER("sender"),
    LIMIT("limit"),
    CUT("cut"),
    ;

    public companion object {
        /** Une raison qu'un serveur plus récent ajouterait se lit `null`. */
        public fun of(wire: String?): TalkieEndReason? = entries.firstOrNull { it.wire == wire }
    }
}

/** `talkie:ended` — chez le destinataire, et chez les autres appareils de l'émetteur. */
@Serializable
public data class TalkieEnded(
    val talkieId: String,
    val fromUserId: String,
    val toUserId: String? = null,
    val reason: String? = null,
    val endedAt: String? = null,
) {
    public val servedReason: TalkieEndReason? get() = TalkieEndReason.of(reason)

    /** `cut` fait taire SUR-LE-CHAMP ; toute autre fin laisse finir ce qui est déjà en file. */
    public val silencesNow: Boolean get() = servedReason == TalkieEndReason.CUT
}
