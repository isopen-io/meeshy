package me.meeshy.sdk.talkie

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

/**
 * Le micro du talkie : rend des trames AAC ADTS une à une, SUR LE FIL de l'émetteur. Le vrai micro est
 * [TalkieMicCapture] ; un double le remplace dans les tests.
 */
interface TalkieCapturing {
    /** Ouvre le micro. `false` : refusé ou indisponible (appel en cours) — rien ne tourne. */
    suspend fun start(onFrame: (data: ByteArray, durationMs: Double) -> Unit): Boolean

    /** Arrête le micro ; rend la main une fois les dernières trames remises à `onFrame`. */
    suspend fun stop()
}

/** Ce qui fait partir la COPIE VOCALE d'un talkie qui n'a pas pu passer (#17141). */
interface TalkieVoiceCopying {
    /**
     * [frames] : les trames AAC ADTS captées, dans l'ordre ; [conversationId] : celle que la passerelle a choisie pour le
     * repli, `null` : le client choisit. `false` : rien n'est parti.
     */
    suspend fun send(frames: List<ByteArray>, toUserId: String, conversationId: String?): Boolean

    /** Une copie confiée à la file d'envoi que celle-ci a fini par abandonner : l'émetteur doit le voir (#17255). */
    val failures: Flow<Unit> get() = emptyFlow()
}
