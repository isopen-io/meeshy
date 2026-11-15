package me.meeshy.sdk.socket

import me.meeshy.sdk.model.call.CallLiveFrameReply
import me.meeshy.sdk.model.call.CallLiveFrameTexts

/**
 * Le cadre en direct d'un appel à deux : seul le CHOIX voyage. L'émission est
 * portée par [CallControlsSocket.selectFrame] (même accusé, même refus typé) ;
 * ce point d'entrée nomme le verbe pour le gestionnaire.
 */
internal class CallLiveFrameSocket(private val controls: CallControlsSocket) {
    suspend fun select(
        callId: String,
        frameId: String?,
        texts: CallLiveFrameTexts?,
        reply: CallLiveFrameReply?,
    ): Result<Unit> = controls.selectFrame(callId, frameId, texts, reply)
}
