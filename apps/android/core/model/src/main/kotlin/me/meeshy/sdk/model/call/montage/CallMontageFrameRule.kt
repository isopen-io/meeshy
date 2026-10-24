package me.meeshy.sdk.model.call.montage

import me.meeshy.sdk.model.call.frames.CallFrameCatalogue
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameMood

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

    /** « Classiques » d'abord, puis les seules ambiances qui ont au moins un cadre pour `n`. */
    public fun chips(forPeople: Int, among: List<CallFrameDesign> = CallFrameCatalogue.all): List<CallMontageMoodChip> =
        listOf(CallMontageMoodChip.Classics) + CallFrameCatalogue.moods(forPeople, among).map { CallMontageMoodChip.Mood(it) }

    /** Le carrousel d'une puce : les classiques, ou les cadres de l'ambiance qui servent `n`. */
    public fun items(chip: CallMontageMoodChip, people: Int, among: List<CallFrameDesign> = CallFrameCatalogue.all): List<CallMontageChoice> =
        when (chip) {
            CallMontageMoodChip.Classics -> CallMontageStyle.entries.map { CallMontageChoice.Classic(it) }
            is CallMontageMoodChip.Mood -> CallFrameCatalogue.frames(people, chip.mood, among).map { CallMontageChoice.Frame(it.id) }
        }

    /** La puce qui porte un choix. Un cadre inconnu du catalogue retombe sur les classiques. */
    public fun chip(choice: CallMontageChoice, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallMontageMoodChip =
        when (choice) {
            is CallMontageChoice.Classic -> CallMontageMoodChip.Classics
            is CallMontageChoice.Frame -> design(choice.id, among)?.let { CallMontageMoodChip.Mood(it.mood) } ?: CallMontageMoodChip.Classics
        }

    public fun design(id: String, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallFrameDesign? =
        CallFrameCatalogue.frame(id, among)

    /**
     * `n` a changé : le même motif dans la nouvelle tranche ; sinon le premier cadre de la même ambiance ;
     * sinon le premier classique. Un classique ne bouge pas.
     */
    public fun reconcile(choice: CallMontageChoice, people: Int, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallMontageChoice =
        when (choice) {
            is CallMontageChoice.Classic -> choice
            is CallMontageChoice.Frame ->
                CallFrameCatalogue.reconcile(choice.id, people, among)?.let { CallMontageChoice.Frame(it.id) } ?: FALLBACK
        }

    /** Toucher une puce : le dernier choix fait dans cette ambiance s'il sert encore `n`, sinon le premier de son carrousel. */
    public fun entering(
        chip: CallMontageMoodChip,
        people: Int,
        remembered: CallMontageChoice?,
        among: List<CallFrameDesign> = CallFrameCatalogue.all,
    ): CallMontageChoice {
        val offered = items(chip, people, among)
        if (remembered != null && remembered in offered) return remembered
        return offered.firstOrNull() ?: FALLBACK
    }
}
