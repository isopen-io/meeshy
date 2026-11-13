package me.meeshy.app.calls

/**
 * La couture qui coupe la sonnerie d'un appel arrivé par PUSH (#13816) : celle du canal de notification, que le
 * contrôleur de tonalité de l'app ne tient pas. « Activer le son » de l'aperçu (P17.3) la coupe avec la sonnerie de l'app ;
 * l'implémentation vit dans l'app, qui possède la notification.
 */
fun interface CallRingSilencing {
    fun silence(callId: String)

    companion object {
        /** Sans notification : le comportement d'avant elle. */
        val Inert: CallRingSilencing = CallRingSilencing { }
    }
}
