package me.meeshy.sdk.model.composer.look

import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.frames.CallFrameCatalogue
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameSurface
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageFrameRule
import me.meeshy.sdk.model.call.montage.CallMontageMoodChip

/** Les effets de visage de l'appel — miroir de `CallFaceEffect` (iOS), dans son ordre. */
public enum class CallFaceEffect(public val raw: String) {
    NONE("none"),
    SMOOTHING("smoothing"),
    TOAD("toad"),
    ANGEL("angel"),
    DEMON("demon"),
    VOLCANO("volcano");

    public val isStylized: Boolean get() = this == TOAD || this == ANGEL || this == DEMON || this == VOLCANO

    public val needsFace: Boolean get() = this != NONE && this != VOLCANO
}

/** Ce que le carrousel des cadres propose : rien, ou un élément du Montage. Miroir de `ComposerPhotoFrame`. */
public sealed interface ComposerPhotoFrame {
    public data object None : ComposerPhotoFrame
    public data class Montage(val choice: CallMontageChoice) : ComposerPhotoFrame
}

/**
 * Le rendu choisi pour une prise : un filtre de l'appel ([VideoFilterPreset.Natural] ⇒ la prise telle
 * quelle), un cadre du Montage et un effet. Miroir de `ComposerPhotoLook` (iOS, #9295, #10311).
 */
public data class ComposerPhotoLook(
    val filter: VideoFilterPreset = VideoFilterPreset.Natural,
    val frame: ComposerPhotoFrame = ComposerPhotoFrame.None,
    val effect: CallFaceEffect = CallFaceEffect.NONE,
) {
    /** Rien n'a été choisi : la prise part telle quelle, octets d'origine compris. */
    public val isUntouched: Boolean
        get() = filter == VideoFilterPreset.Natural && frame == ComposerPhotoFrame.None && effect == CallFaceEffect.NONE

    /** Le même look sans son cadre — ce qui se peint le temps que le cadre cuise. */
    public val withoutFrame: ComposerPhotoLook get() = copy(frame = ComposerPhotoFrame.None)
}

/** Les cadres d'une prise — miroir de `ComposerPhotoLookRule` (iOS). */
public object ComposerPhotoLookRule {
    /**
     * Une photo porte une personne ; le catalogue commence au duo. Les cadres d'un duo la servent quand
     * même (leur géométrie retombe en grille d'une case) ; les classiques servent une personne d'emblée.
     */
    public const val CATALOG_PEOPLE: Int = 2

    /** Les filtres de l'appel, dans son ordre ; [VideoFilterPreset.Natural] en tête rend l'original. */
    public val filters: List<VideoFilterPreset> = VideoFilterPreset.entries

    public fun chips(among: List<CallFrameDesign> = CallFrameCatalogue.all): List<CallMontageMoodChip> =
        CallMontageFrameRule.chips(CATALOG_PEOPLE, among)

    /** Le carrousel d'une puce, « Aucun cadre » en tête. */
    public fun frames(chip: CallMontageMoodChip, among: List<CallFrameDesign> = CallFrameCatalogue.all): List<ComposerPhotoFrame> =
        listOf(ComposerPhotoFrame.None) + CallMontageFrameRule.items(chip, CATALOG_PEOPLE, among).map { ComposerPhotoFrame.Montage(it) }

    /** La puce qui porte un cadre ; « Aucun cadre » vit chez les classiques. */
    public fun chip(frame: ComposerPhotoFrame, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallMontageMoodChip =
        when (frame) {
            ComposerPhotoFrame.None -> CallMontageMoodChip.Classics
            is ComposerPhotoFrame.Montage -> CallMontageFrameRule.chip(frame.choice, among)
        }
}

/**
 * Les cadres que la retouche compose en direct — miroir de `ComposerLiveLookRule` + `CallLiveFrameRule.isEligible` :
 * les classiques, puis les cadres du catalogue qui servent un duo et déclarent la surface `live`.
 */
public object ComposerLiveLookRule {

    public fun isEligible(design: CallFrameDesign): Boolean =
        design.serves(ComposerPhotoLookRule.CATALOG_PEOPLE) && design.isOffered(CallFrameSurface.LIVE)

    public fun chips(among: List<CallFrameDesign> = CallFrameCatalogue.all): List<CallMontageMoodChip> =
        ComposerPhotoLookRule.chips(among).filter { chip -> frames(chip, among).any { it != ComposerPhotoFrame.None } }

    public fun frames(chip: CallMontageMoodChip, among: List<CallFrameDesign> = CallFrameCatalogue.all): List<ComposerPhotoFrame> =
        ComposerPhotoLookRule.frames(chip, among).filter { frame ->
            val choice = (frame as? ComposerPhotoFrame.Montage)?.choice as? CallMontageChoice.Frame ?: return@filter true
            CallMontageFrameRule.design(choice.id, among)?.let(::isEligible) ?: false
        }

    /** Le dessin du cadre à composer ; `null` sans cadre, pour un classique, ou pour un cadre inconnu. */
    public fun design(frame: ComposerPhotoFrame, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallFrameDesign? {
        val choice = (frame as? ComposerPhotoFrame.Montage)?.choice as? CallMontageChoice.Frame ?: return null
        return CallMontageFrameRule.design(choice.id, among)
    }
}
