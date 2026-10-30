package me.meeshy.sdk.outbox

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

/**
 * #13820 — ce qu'un envoi né HORS DU FIL a le droit de faire : un partage, une réponse à une humeur, un transfert. Le fil
 * ouvert sait le régime de sa conversation (composeur, socket) ; ces gestes, eux, visent une conversation que l'appareil ne connaît que par son cache, et le cache peut dire « server » d'une
 * conversation passée en e2ee pendant que l'appareil était loin.
 */
public enum class OutOfThreadAdmission {
    /** Le mode vient d'être relu au serveur, sans bout en bout : la bulle naît et part. */
    SEND,

    /**
     * Le mode ne se relit pas maintenant (hors ligne, délai dépassé) : la bulle naît EN FILE, et la file relit le mode avant
     * de laisser partir le moindre clair vers cette conversation ([EndToEndOutboxAdmission.judge]). Rien ne part sur la foi
     * du cache.
     */
    QUEUE_UNTIL_MODE_KNOWN,

    /** Chiffrée de bout en bout (registre, cache, fil en cache ou mode relu) : rien ne naît, rien ne part. */
    END_TO_END,

    /** La passerelle refuse de servir la conversation (introuvable, plus membre) : rien ne naît. */
    UNREACHABLE,
    ;

    /** La bulle peut naître et entrer en file. */
    public val mayQueue: Boolean get() = this == SEND || this == QUEUE_UNTIL_MODE_KNOWN
}

/**
 * La porte que tout envoi hors du fil franchit AVANT de mettre en file ([OutOfThreadAdmission]). L'implémentation est
 * [EndToEndOutboxAdmission.admit] : la même loi que la réponse d'une bannière ([EndToEndOutboxAdmission.outOfThreadVerdictFor]),
 * bornée dans le temps du geste.
 */
public fun interface OutOfThreadSendGate {
    public suspend fun admit(conversationId: String): OutOfThreadAdmission

    /**
     * Un geste vers PLUSIEURS conversations (partage, transfert) : leurs modes se relisent en PARALLÈLE, donc dans la borne
     * d'un seul [admit] et non dans N bornes à la suite.
     */
    public suspend fun admitAll(conversationIds: List<String>): Map<String, OutOfThreadAdmission> = coroutineScope {
        conversationIds.distinct()
            .map { id -> async { id to admit(id) } }
            .awaitAll()
            .toMap()
    }
}
