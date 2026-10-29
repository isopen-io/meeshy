package me.meeshy.sdk.model.call.montage

import me.meeshy.sdk.model.call.frames.CallFrameCatalogue
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameStyleRule
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule

/**
 * Ce que le mode Montage a choisi côté Android : un classique propre à la capture (`null` : la capture
 * suit le cadre en direct), le dernier classique choisi, et la puce dont le carrousel est montré
 * (`null` : celle du choix).
 */
public data class CallMontagePick(
    val classic: CallMontageStyle? = null,
    val lastClassic: CallMontageStyle = CallCaptureSceneRule.DEFAULT_STYLE,
    val shown: CallMontageMoodChip? = null,
)

/**
 * **LE CHOIX DU MODE MONTAGE ANDROID** (#13690) — la puce « Classiques » et ses treize montages d'iOS
 * (`CallMontageModeControls`, `CallMontageFrameRule.chips`) à côté des cadres en direct. Un cadre
 * s'applique d'un toucher chez moi et se propose à l'autre : toucher une AMBIANCE ne fait donc que
 * montrer ses cadres, sans rien appliquer. Toucher « Classiques » reprend le dernier classique choisi,
 * comme `CallCaptureController.show` d'iOS. Un classique choisi se capture même sous un cadre en
 * direct ; toucher un cadre (ou « Aucun cadre ») rend la capture au cadre en direct.
 */
public object CallMontagePickRule {
    public fun chips(among: List<CallFrameDesign> = CallFrameCatalogue.all): List<CallMontageMoodChip> =
        listOf(CallMontageMoodChip.Classics) + CallLiveFrameRule.moods(among).map { CallMontageMoodChip.Mood(it) }

    public fun classics(): List<CallMontageStyle> = CallMontageStyle.entries.toList()

    public fun choice(pick: CallMontagePick, liveFrameId: String?): CallMontageChoice =
        pick.classic?.let { CallMontageChoice.Classic(it) }
            ?: liveFrameId?.let { CallMontageChoice.Frame(it) }
            ?: CallMontageChoice.Classic(CallCaptureSceneRule.DEFAULT_STYLE)

    public fun shownChip(pick: CallMontagePick, liveFrameId: String?, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallMontageMoodChip =
        pick.shown ?: CallMontageFrameRule.chip(choice(pick, liveFrameId), among)

    public fun showing(pick: CallMontagePick, chip: CallMontageMoodChip): CallMontagePick = when (chip) {
        CallMontageMoodChip.Classics -> pick.copy(shown = chip, classic = pick.lastClassic)
        is CallMontageMoodChip.Mood -> pick.copy(shown = chip)
    }

    public fun pickingClassic(pick: CallMontagePick, style: CallMontageStyle): CallMontagePick =
        pick.copy(classic = style, lastClassic = style, shown = CallMontageMoodChip.Classics)

    public fun pickingFrame(pick: CallMontagePick): CallMontagePick = pick.copy(classic = null)

    /** Un élément du carrousel est-il le choix en cours ? Un cadre se compare par sa base (ses déclinaisons comprises). */
    public fun isSelected(pick: CallMontagePick, liveFrameId: String?, item: CallMontageChoice): Boolean =
        when (val current = choice(pick, liveFrameId)) {
            is CallMontageChoice.Classic -> current == item
            is CallMontageChoice.Frame -> item is CallMontageChoice.Frame && CallFrameStyleRule.baseId(current.id) == CallFrameStyleRule.baseId(item.id)
        }

    public fun look(pick: CallMontagePick, liveFrameId: String?, people: Int = CallLiveFrameRule.PEOPLE): CallCaptureLook =
        when (val current = choice(pick, liveFrameId)) {
            is CallMontageChoice.Classic -> CallCaptureLook.Classic(current.style)
            is CallMontageChoice.Frame -> CallCaptureSceneRule.look(current.id, people)
        }
}
