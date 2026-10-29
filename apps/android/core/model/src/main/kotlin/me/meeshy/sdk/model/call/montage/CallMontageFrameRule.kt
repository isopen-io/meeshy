package me.meeshy.sdk.model.call.montage

import me.meeshy.sdk.model.call.frames.CallFrameCatalogue
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameMood
import me.meeshy.sdk.model.call.frames.CallFrameScope
import me.meeshy.sdk.model.call.frames.CallFrameSpotlightRule
import me.meeshy.sdk.model.call.frames.CallFrameStyleRule

/** Ce que le carrousel du Montage propose : un montage classique, ou un cadre du catalogue (par son identifiant stable). */
public sealed interface CallMontageChoice {
    public data class Classic(val style: CallMontageStyle) : CallMontageChoice
    public data class Frame(val id: String) : CallMontageChoice
}

/** Une puce d'ambiance au-dessus du carrousel : « Classiques » en tête, puis les ambiances du catalogue. */
public sealed interface CallMontageMoodChip {
    public data object Classics : CallMontageMoodChip
    public data class Mood(val mood: CallFrameMood) : CallMontageMoodChip
}

/**
 * **LA NAVIGATION DU MONTAGE** (#8742) — portage de `CallMontageFrameRule.swift`, en fonctions pures :
 * quelles puces pour `n` personnes (moi compris), quels éléments dans le carrousel d'une puce, et où
 * retombe le choix quand `n` change.
 */
public object CallMontageFrameRule {
    /** Le dernier recours : le premier classique. */
    public val FALLBACK: CallMontageChoice = CallMontageChoice.Classic(CallMontageStyle.entries.first())

    /**
     * « Classiques » d'abord, puis les seules ambiances qui ont au moins un cadre pour `n` : toutes (`ALL`, ordre
     * canonique), ou celles ouvertes d'office et leur ordre (`SPOTLIGHT`, #12683).
     */
    public fun chips(
        forPeople: Int,
        among: List<CallFrameDesign> = CallFrameCatalogue.all,
        scope: CallFrameScope = CallFrameScope.ALL,
    ): List<CallMontageMoodChip> =
        listOf(CallMontageMoodChip.Classics) + CallFrameSpotlightRule.moods(forPeople, scope, among).map { CallMontageMoodChip.Mood(it) }

    /** Le carrousel d'une puce : les classiques, ou les cadres de l'ambiance qui servent `n` — tous, ou ses seules vedettes. */
    public fun items(
        chip: CallMontageMoodChip,
        people: Int,
        among: List<CallFrameDesign> = CallFrameCatalogue.all,
        scope: CallFrameScope = CallFrameScope.ALL,
    ): List<CallMontageChoice> =
        when (chip) {
            CallMontageMoodChip.Classics -> CallMontageStyle.entries.map { CallMontageChoice.Classic(it) }
            is CallMontageMoodChip.Mood -> CallFrameSpotlightRule.frames(people, chip.mood, scope, among).map { CallMontageChoice.Frame(it.id) }
        }

    /** La portée montrée pour un choix : celle demandée, sauf si le cadre choisi n'y figure pas. */
    public fun scope(choice: CallMontageChoice, people: Int, requested: CallFrameScope, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallFrameScope =
        when (choice) {
            is CallMontageChoice.Classic -> requested
            is CallMontageChoice.Frame -> CallFrameSpotlightRule.scope(choice.id, people, requested, among)
        }

    /** Le cadre de base d'un choix décliné (#12685) ; un classique ou un cadre de base reste lui-même. */
    public fun base(choice: CallMontageChoice): CallMontageChoice = when (choice) {
        is CallMontageChoice.Classic -> choice
        is CallMontageChoice.Frame -> CallMontageChoice.Frame(CallFrameStyleRule.baseId(choice.id))
    }

    /** Les identifiants qu'un glissement vertical parcourt : le cadre, puis ses déclinaisons. */
    public fun declinations(choice: CallMontageChoice, among: List<CallFrameDesign> = CallFrameCatalogue.all): List<String> = when (choice) {
        is CallMontageChoice.Classic -> emptyList()
        is CallMontageChoice.Frame -> CallFrameStyleRule.declinations(CallFrameStyleRule.baseId(choice.id), among).map { it.id }
    }

    /** La puce qui porte un choix. Un cadre inconnu du catalogue retombe sur les classiques. */
    public fun chip(choice: CallMontageChoice, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallMontageMoodChip =
        when (choice) {
            is CallMontageChoice.Classic -> CallMontageMoodChip.Classics
            is CallMontageChoice.Frame -> design(choice.id, among)?.let { CallMontageMoodChip.Mood(it.mood) } ?: CallMontageMoodChip.Classics
        }

    public fun design(id: String, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallFrameDesign? =
        CallFrameCatalogue.frame(id, among)

    /** Le nom d'un cadre dans le carrousel : le nom propre du motif, suivi de sa déclinaison s'il en porte une (iOS `CallFrameCopy.choiceName`). */
    public fun frameName(id: String, among: List<CallFrameDesign> = CallFrameCatalogue.all): String? {
        val design = design(id, among) ?: return null
        val style = design.styles.firstOrNull { it.id == design.styleId } ?: return design.name
        return "${design.name} · ${style.name}"
    }

    /**
     * `n` a changé : un cadre (décliné ou non) qui sert encore `n` ne bouge pas ; sinon le même motif dans la nouvelle tranche ; sinon le premier cadre de la même ambiance ;
     * sinon le premier classique. Un classique ne bouge pas.
     */
    public fun reconcile(choice: CallMontageChoice, people: Int, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallMontageChoice =
        when (choice) {
            is CallMontageChoice.Classic -> choice
            is CallMontageChoice.Frame -> when {
                design(choice.id, among)?.serves(people) == true -> choice
                else -> CallFrameCatalogue.reconcile(choice.id, people, among)?.let { CallMontageChoice.Frame(it.id) } ?: FALLBACK
            }
        }

    /** Toucher une puce : le dernier choix fait dans cette ambiance s'il sert encore `n`, sinon le premier de son carrousel. */
    public fun entering(
        chip: CallMontageMoodChip,
        people: Int,
        remembered: CallMontageChoice?,
        among: List<CallFrameDesign> = CallFrameCatalogue.all,
        scope: CallFrameScope = CallFrameScope.ALL,
    ): CallMontageChoice {
        val offered = items(chip, people, among, scope)
        if (remembered != null && base(remembered) in offered) return remembered
        return offered.firstOrNull() ?: FALLBACK
    }
}
