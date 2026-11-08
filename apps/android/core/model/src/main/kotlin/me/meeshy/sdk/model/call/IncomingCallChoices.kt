package me.meeshy.sdk.model.call

/** Un bouton de l'écran d'appel entrant — iOS `IncomingCallAction`. */
enum class IncomingCallAction {
    Decline,

    /** Décrocher caméra jamais ouverte : n'existe que pour un appel vidéo (vue P17). */
    AnswerWithoutVideo,
    Accept,
}

/**
 * Ce que propose l'écran d'appel entrant (`docs/product/appels-vue-finale.md` vue P17, miroir d'iOS
 * `IncomingCallChoices`). Règle pure : de gauche à droite Refuser, (Sans vidéo), Répondre — Répondre reste au bord
 * droit, sous le pouce, comme sur tout écran de sonnerie.
 */
object IncomingCallChoices {
    private const val ROOMY_SPACING_DP = 60
    private const val TIGHT_SPACING_DP = 36

    fun actions(isVideoCall: Boolean): List<IncomingCallAction> =
        if (isVideoCall) {
            listOf(IncomingCallAction.Decline, IncomingCallAction.AnswerWithoutVideo, IncomingCallAction.Accept)
        } else {
            listOf(IncomingCallAction.Decline, IncomingCallAction.Accept)
        }

    /** L'espace entre les boutons ronds de 70 dp : trois doivent tenir sur un écran de 320 dp de large. */
    fun buttonSpacingDp(count: Int): Int = if (count > 2) TIGHT_SPACING_DP else ROOMY_SPACING_DP
}
