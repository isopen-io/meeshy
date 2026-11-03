package me.meeshy.sdk.game

import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.game.GameErrorCode

/**
 * Le registre des identifiants d'idempotence, UN par INTENTION (le tap de l'utilisateur), jamais un par requête.
 *
 * Un réessai réseau rejoue le même identifiant : la passerelle reconnaît la première écriture et rend son résultat au
 * lieu d'en faire une seconde. L'identifiant ne se renouvelle que lorsque l'intention est RÉGLÉE — après un succès
 * (« déjà fait » compris), ou après `REQUEST_ID_CONFLICT` (l'identifiant a servi à une autre écriture : il est libéré).
 * Une coupure, un délai, un 5xx ou un autre refus le laissent en place.
 */
@Singleton
class GameRequestIdLedger(private val newId: () -> String) {

    @Inject
    constructor() : this({ UUID.randomUUID().toString() })

    private val pending = HashMap<String, String>()

    /** L'identifiant de cette intention : né au premier appel, le même jusqu'à ce qu'elle soit réglée. */
    @Synchronized
    fun idFor(intent: String): String = pending.getOrPut(intent) { newId() }

    @Synchronized
    fun release(intent: String) {
        pending.remove(intent)
    }

    /** Enregistre l'issue d'un envoi : libère l'identifiant d'un succès ou d'un conflit d'identifiant, garde le reste. */
    fun settle(intent: String, result: GameServiceResult<*>) {
        val settled = when (result) {
            is GameServiceResult.Done -> true
            is GameServiceResult.Refused -> result.refusal.code == GameErrorCode.RequestIdConflict
            else -> false
        }
        if (settled) release(intent)
    }

    /** Envoie l'intention sous son identifiant, puis règle le registre sur l'issue. */
    suspend fun <T> perform(intent: String, send: suspend (requestId: String) -> GameServiceResult<T>): GameServiceResult<T> =
        send(idFor(intent)).also { settle(intent, it) }
}
