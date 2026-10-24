package me.meeshy.sdk.model.call.montage

import me.meeshy.sdk.model.call.frames.CallFrameCatalogue
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameMood

public sealed interface CallMontageChoice {
    public data class Classic(val style: CallMontageStyle) : CallMontageChoice
    public data class Frame(val id: String) : CallMontageChoice
}

public sealed interface CallMontageMoodChip {
    public data object Classics : CallMontageMoodChip
    public data class Mood(val mood: CallFrameMood) : CallMontageMoodChip
}

public object CallMontageFrameRule {
    public val FALLBACK: CallMontageChoice = CallMontageChoice.Frame("")
    public fun chips(forPeople: Int, among: List<CallFrameDesign> = CallFrameCatalogue.all): List<CallMontageMoodChip> = emptyList()
    public fun items(chip: CallMontageMoodChip, people: Int, among: List<CallFrameDesign> = CallFrameCatalogue.all): List<CallMontageChoice> = emptyList()
    public fun chip(choice: CallMontageChoice, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallMontageMoodChip = CallMontageMoodChip.Classics
    public fun design(id: String, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallFrameDesign? = null
    public fun reconcile(choice: CallMontageChoice, people: Int, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallMontageChoice = choice
    public fun entering(chip: CallMontageMoodChip, people: Int, remembered: CallMontageChoice?, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallMontageChoice = FALLBACK
}
