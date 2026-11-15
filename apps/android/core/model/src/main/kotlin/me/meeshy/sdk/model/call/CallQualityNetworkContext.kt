package me.meeshy.sdk.model.call

/** Ce que les chiffres ne disent pas : le média passe-t-il par un relais TURN ou par un chemin direct ? */
data class CallQualityNetworkContext(val relayed: Boolean?) {
    companion object {
        /** `null` tant que la route n'est pas connue : la feuille n'affiche alors aucune ligne de contexte. */
        fun from(reading: CallQualityReading?): CallQualityNetworkContext? =
            reading?.relayed?.let { CallQualityNetworkContext(it) }
    }
}
