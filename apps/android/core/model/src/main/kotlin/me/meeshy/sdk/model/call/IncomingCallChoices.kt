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

    /** P17.1 — le disque de l'appelant (avatar et anneaux) ne se pose pas sur son visage : dès que sa vidéo joue derrière la sonnerie, elle le remplace. */
    fun showsCallerDisc(previewPlaysVideo: Boolean): Boolean = !previewPlaysVideo

    /**
     * P17.5 — ma vignette ne montre que ce que la caméra filme vraiment : un appel vidéo, une piste locale vivante et
     * Caméra choisie dans la barre. Caméra refusée, absente ou coupée ⇒ pas de vignette noire.
     */
    fun showsSelfPreview(isVideoCall: Boolean, hasLocalVideoTrack: Boolean, cameraChosen: Boolean = true): Boolean =
        isVideoCall && hasLocalVideoTrack && cameraChosen

    /** P17.5 — ma vignette apparaît et disparaît en fondu ; « Réduire les animations » le raccourcit sans le couper. */
    fun selfPreviewFadeMillis(reduceMotion: Boolean): Int = if (reduceMotion) CallChromeStow.REDUCED_FADE_MILLIS else SELF_PREVIEW_FADE_MILLIS

    /** P17.6 — la barre « X vous verra en décrochant » et ses bascules Micro et Caméra : un appel vidéo seulement. */
    fun showsPreAnswerBar(isVideoCall: Boolean): Boolean = isVideoCall

    /** P17.4 — la graine de MA couleur sur ma vignette (loi 4) : mon identifiant, jamais mon nom. Sans identifiant, aucune couleur n'est inventée. */
    fun selfColorKey(userId: String?): String? = userId?.takeIf { it.isNotBlank() }

    /** P17.11 — le glyphe de « Répondre » annonce ce qui partira : caméra coupée dans la barre ⇒ un téléphone. */
    fun acceptGlyph(isVideoCall: Boolean, route: IncomingPreAnswer.Route): IncomingAcceptGlyph =
        if (isVideoCall && route == IncomingPreAnswer.Route.AsOffered) IncomingAcceptGlyph.Video else IncomingAcceptGlyph.Phone

    private const val SELF_PREVIEW_FADE_MILLIS = 250
}

/** Le glyphe de « Répondre » (P17.11). */
enum class IncomingAcceptGlyph { Video, Phone }

/** La disposition de l'écran entrant : la vue P17 pour un appel vidéo, l'écran livré (#8480) pour un appel audio, que la planche ne redessine pas. */
enum class IncomingCallLayout {
    Audio,
    VideoPreview,
    ;

    /** P17.2 — la puce de verre « Appel vidéo entrant » AU-DESSUS du nom. */
    val showsTypeChipAboveName: Boolean get() = this == VideoPreview

    /** L'écran audio garde sa ligne grise et son badge SOUS le nom. */
    val showsTypeLineAndBadge: Boolean get() = this == Audio

    companion object {
        fun of(isVideoCall: Boolean): IncomingCallLayout = if (isVideoCall) VideoPreview else Audio
    }
}
