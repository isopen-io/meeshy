package me.meeshy.sdk.model.call

/**
 * Le palier de la vignette retenu PAR APPEL : un appel qui change (ou un appel inconnu) revient
 * au palier standard. Un seul appel est tenu à la fois (miroir de iOS `CallSelfTileMemory`).
 */
class CallSelfTileMemory {
    private var callId: String? = null
    private var stored: CallSelfTileScale = CallSelfTileScale.Standard

    @Synchronized
    fun scale(callId: String?): CallSelfTileScale =
        if (callId != null && callId == this.callId) stored else CallSelfTileScale.Standard

    @Synchronized
    fun remember(scale: CallSelfTileScale, callId: String?) {
        if (callId == null) return
        this.callId = callId
        stored = scale
    }
}
