package me.meeshy.app.calls

import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import me.meeshy.sdk.model.call.montage.CallCaptureSceneRule
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontagePick
import me.meeshy.sdk.model.call.montage.CallMontagePickRule

/**
 * La couche « cadre » de la pile d'effets (loi 14, #16979) : le cadre CHOISI au Montage. Un classique n'est pas un cadre ;
 * sans cadre choisi, la couche n'existe pas.
 */
internal object CallFrameLayer {
    /** L'identifiant du cadre choisi, ramené à [people] personnes ; `null` sur un classique. */
    fun chosen(pick: CallMontagePick, people: Int): String? =
        (CallMontagePickRule.choice(pick, people) as? CallMontageChoice.Frame)?.id

    /**
     * Retire la couche « cadre » : le choix revient au classique par défaut, et si ce cadre est GARDÉ en direct (option
     * « Cadre », loi 16), il tombe aussi, par le même chemin que décocher « Cadre » — l'autre le voit tomber comme aujourd'hui.
     */
    fun remove(capture: CallCaptureController, live: CallLiveFrameController, held: String?, chosen: String?) {
        if (chosen != null && held == chosen) live.apply(CallLiveFrameRule.toggledHold(held, chosen))
        capture.select(CallMontageChoice.Classic(CallCaptureSceneRule.DEFAULT_STYLE))
    }
}
