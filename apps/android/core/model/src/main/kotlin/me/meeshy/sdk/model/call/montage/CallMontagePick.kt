package me.meeshy.sdk.model.call.montage

import me.meeshy.sdk.model.call.frames.CallFrameCatalogue
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameScope
import me.meeshy.sdk.model.call.frames.CallFrameSpotlightRule
import me.meeshy.sdk.model.call.frames.CallFrameStyleRule
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule

/**
 * Ce que le mode Montage a choisi pour la CAPTURE (miroir de l'état de `CallCaptureController`, iOS) : le dernier
 * classique, le cadre choisi (`null` : le classique), le dernier choix fait dans chaque ambiance, et la portée
 * demandée du carrousel. Rien de tout cela ne touche le cadre gardé pendant l'appel.
 */
public data class CallMontagePick(
    val style: CallMontageStyle = CallCaptureSceneRule.DEFAULT_STYLE,
    val frameId: String? = null,
    val remembered: Map<CallMontageMoodChip, CallMontageChoice> = emptyMap(),
    val requestedScope: CallFrameScope = CallFrameScope.SPOTLIGHT,
) {
    val raw: CallMontageChoice get() = frameId?.let { CallMontageChoice.Frame(it) } ?: CallMontageChoice.Classic(style)
}

/** L'interrupteur « Plus d'ambiances » / « Moins d'ambiances » : `showsAll` vrai, il replie. */
public data class CallMontageScopeToggle(val showsAll: Boolean)

/** L'option « Cadre » de la barre d'actions : le cadre affiché, et s'il est déjà gardé pendant l'appel. */
public data class CallMontageHold(val frameId: String, val isOn: Boolean)

/**
 * **LE CHOIX DU MODE MONTAGE** (#13732) — portage de `CallCaptureController.select/show/setFrameScope` et de
 * `CallMontageModeControls` (iOS) : choisir un classique ou un cadre ne sert que la capture ; toucher une puce y
 * choisit son dernier élément (sinon son premier) ; « Plus d'ambiances » ouvre tout le catalogue ; l'option
 * « Cadre » ([hold]) garde le cadre affiché pendant l'appel et le propose à l'autre.
 */
public object CallMontagePickRule {
    public fun classics(): List<CallMontageStyle> = CallMontageStyle.entries.toList()

    /** Le choix en cours, ramené à `n` personnes. */
    public fun choice(pick: CallMontagePick, people: Int): CallMontageChoice = CallMontageFrameRule.reconcile(pick.raw, people)

    public fun selecting(pick: CallMontagePick, choice: CallMontageChoice): CallMontagePick {
        if (choice == pick.raw) return pick
        val remembered = pick.remembered + (CallMontageFrameRule.chip(choice) to choice)
        return when (choice) {
            is CallMontageChoice.Classic -> pick.copy(style = choice.style, frameId = null, remembered = remembered)
            is CallMontageChoice.Frame -> pick.copy(frameId = choice.id, remembered = remembered)
        }
    }

    /** Toucher une puce : le carrousel change, et son dernier choix (sinon son premier élément) est pris. */
    public fun showing(pick: CallMontagePick, chip: CallMontageMoodChip, people: Int): CallMontagePick =
        selecting(pick, CallMontageFrameRule.entering(chip, people, pick.remembered[chip], scope = scope(pick, people)))

    /** À l'ouverture du mode, le cadre gardé pendant l'appel devient le choix (iOS `onAppear`). */
    public fun opening(pick: CallMontagePick, heldFrameId: String?): CallMontagePick =
        heldFrameId?.let { selecting(pick, CallMontageChoice.Frame(it)) } ?: pick

    public fun scope(pick: CallMontagePick, people: Int): CallFrameScope =
        CallMontageFrameRule.scope(choice(pick, people), people, pick.requestedScope)

    /** « Moins d'ambiances » ramène le choix sur une vedette s'il n'y figure plus. */
    public fun settingScope(pick: CallMontagePick, scope: CallFrameScope, people: Int): CallMontagePick {
        val requested = pick.copy(requestedScope = scope)
        val current = choice(requested, people)
        if (scope != CallFrameScope.SPOTLIGHT || CallMontageFrameRule.scope(current, people, scope) == scope) return requested
        val chip = CallMontageFrameRule.chip(current)
        val mood = if (chip in CallMontageFrameRule.chips(people, scope = scope)) chip else CallMontageMoodChip.Classics
        return selecting(requested, CallMontageFrameRule.entering(mood, people, remembered = null, scope = scope))
    }

    public fun chips(pick: CallMontagePick, people: Int): List<CallMontageMoodChip> =
        CallMontageFrameRule.chips(people, scope = scope(pick, people))

    public fun shownChip(pick: CallMontagePick, people: Int): CallMontageMoodChip = CallMontageFrameRule.chip(choice(pick, people))

    public fun items(pick: CallMontagePick, people: Int): List<CallMontageChoice> =
        CallMontageFrameRule.items(shownChip(pick, people), people, scope = scope(pick, people))

    /** Le carrousel ne connaît que les cadres de base : une déclinaison choisie y montre son cadre. */
    public fun selection(pick: CallMontagePick, people: Int): CallMontageChoice = CallMontageFrameRule.base(choice(pick, people))

    /** L'élément tel qu'il est posé : le cadre choisi sous sa déclinaison, les autres tels quels. */
    public fun declined(pick: CallMontagePick, item: CallMontageChoice, people: Int): CallMontageChoice {
        val current = choice(pick, people)
        return if (CallMontageFrameRule.base(current) == item) current else item
    }

    /** « Plus d'ambiances » en fin de rangée, tant que la mise en avant cache quelque chose pour `n`. */
    public fun scopeToggle(pick: CallMontagePick, people: Int): CallMontageScopeToggle? {
        if (!CallFrameSpotlightRule.hidesFrames(people)) return null
        return CallMontageScopeToggle(showsAll = scope(pick, people) == CallFrameScope.ALL)
    }

    /** L'option « Cadre » : rien sur un classique, rien hors d'un duo vidéo ni sur un cadre de capture seule. */
    public fun hold(pick: CallMontagePick, people: Int, heldFrameId: String?, isOffered: Boolean): CallMontageHold? {
        val id = (choice(pick, people) as? CallMontageChoice.Frame)?.id ?: return null
        if (!CallLiveFrameRule.mayHold(id, isOffered)) return null
        return CallMontageHold(id, isOn = heldFrameId == id)
    }

    public fun look(pick: CallMontagePick, people: Int): CallCaptureLook =
        when (val current = choice(pick, people)) {
            is CallMontageChoice.Classic -> CallCaptureLook.Classic(current.style)
            is CallMontageChoice.Frame ->
                CallMontageFrameRule.design(current.id)?.let { CallCaptureLook.Frame(it) } ?: CallCaptureLook.Classic(pick.style)
        }

    /** Les cadres dont la vignette se peint : l'ambiance du choix à `THUMBNAIL_RADIUS` du cadre, puis ses déclinaisons. */
    public fun frameWindow(pick: CallMontagePick, people: Int, among: List<CallFrameDesign> = CallFrameCatalogue.all): List<CallFrameDesign> {
        val id = (choice(pick, people) as? CallMontageChoice.Frame)?.id ?: return emptyList()
        val mood = (CallMontageFrameRule.chip(CallMontageChoice.Frame(id), among) as? CallMontageMoodChip.Mood)?.mood ?: return emptyList()
        val frames = CallFrameSpotlightRule.frames(people, mood, scope(pick, people), among)
        val base = CallFrameStyleRule.baseId(id)
        val ids = CallCapturePreviewRule.window(base, frames.map { it.id }, CallCapturePreviewRule.THUMBNAIL_RADIUS).toSet()
        return frames.filter { it.id in ids } + CallFrameStyleRule.declinations(base, among).drop(1)
    }
}

/**
 * Ce que la scène du Montage montre (iOS `CallMontageFrameStage`). La surface du cadre gardé se retire sous un mode
 * (`CallLiveFrameRule.showsHeldFrame`) : le cadre gardé, choisi, se sert donc ici comme tout cadre en direct.
 */
public sealed interface CallMontageStage {
    /** Un cadre servi en direct se pose sur le flux vidéo, à pleine cadence. */
    public data class Live(val design: CallFrameDesign) : CallMontageStage

    /** Un classique, ou un cadre que le direct ne sert pas : l'aperçu peint quelques fois par seconde. */
    public data object Painted : CallMontageStage
}

public object CallMontageStageRule {
    /** [live] : le cadre choisi tel que le direct le sert, s'il le sert. */
    public fun stage(look: CallCaptureLook, live: CallFrameDesign?): CallMontageStage = when (look) {
        is CallCaptureLook.Classic -> CallMontageStage.Painted
        is CallCaptureLook.Frame -> live?.let(CallMontageStage::Live) ?: CallMontageStage.Painted
    }
}
