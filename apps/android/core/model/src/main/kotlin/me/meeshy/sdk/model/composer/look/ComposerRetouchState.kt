package me.meeshy.sdk.model.composer.look

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import me.meeshy.sdk.model.imageedit.CropRect
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import me.meeshy.sdk.model.media.MediaTrimBounds
import me.meeshy.sdk.model.media.MediaTrimRule

/** Une toile de rendu, en pixels. */
public data class ComposerLookSize(val width: Int, val height: Int)

/**
 * **LA TOILE D'UNE PRISE RETOUCHÉE** — ce qui part garde les proportions de la prise (les cadres sont en
 * proportion de la toile : 9:16, 4:5, 1:1, 16:9 sont servis), à des dimensions paires, au plus
 * [EXPORT_LONG_SIDE] de grand côté ; l'aperçu se peint à [PREVIEW_LONG_SIDE] — un changement de look coûte
 * une image d'écran, jamais une photo pleine définition.
 */
public object ComposerLookCanvas {
    public const val PREVIEW_LONG_SIDE: Int = 1280
    public const val EXPORT_LONG_SIDE: Int = 2560
    public const val THUMBNAIL_LONG_SIDE: Int = 200

    public fun fitted(sourceWidth: Int, sourceHeight: Int, longSide: Int): ComposerLookSize? {
        if (sourceWidth <= 0 || sourceHeight <= 0 || longSide <= 0) return null
        val scale = min(1.0, longSide.toDouble() / max(sourceWidth, sourceHeight))
        return ComposerLookSize(even(sourceWidth * scale), even(sourceHeight * scale))
    }

    /** Où une image de [imageWidth] × [imageHeight] se pose, entière et centrée, dans un conteneur. */
    public fun displayRect(containerWidth: Float, containerHeight: Float, imageWidth: Int, imageHeight: Int): CropRect {
        if (containerWidth <= 0f || containerHeight <= 0f || imageWidth <= 0 || imageHeight <= 0) return CropRect(0f, 0f, 0f, 0f)
        val scale = min(containerWidth / imageWidth, containerHeight / imageHeight)
        val width = imageWidth * scale
        val height = imageHeight * scale
        return CropRect((containerWidth - width) / 2f, (containerHeight - height) / 2f, width, height)
    }

    private fun even(value: Double): Int {
        val whole = value.roundToInt()
        return max(2, whole - whole % 2)
    }
}

/** Ce que « Terminé » remet : la prise telle quelle (octets d'origine), ou son rendu. */
public enum class ComposerRetouchDelivery { ORIGINAL, RENDERED }

/**
 * **L'ÉTAT DE LA RETOUCHE UNIQUE** (#11133, #12614) — miroir des lois d'iOS (`ComposerEditTools`,
 * `ComposerLookStripRule`, `ComposerCaptureCoverLife`) pour l'écran Android, en valeur immuable :
 * le look (filtre · effet · cadre), la famille ouverte, les outils montrés, et la réponse à l'hôte qui ne
 * part qu'UNE fois.
 */
public data class ComposerRetouchState(
    val take: ComposerEditTake = ComposerEditTake.Photo,
    val families: List<ComposerLookFamily> = ComposerLookStripRule.families(effects = emptyList()),
    val tools: List<ComposerEditTool> = emptyList(),
    val look: ComposerPhotoLook = ComposerPhotoLook(),
    val openFamily: ComposerLookFamily? = null,
    val activeTools: Set<ComposerEditTool> = emptySet(),
    val settled: Boolean = false,
    /** Le recadrage (normalisé dans la prise debout) ; `null` ⇒ la prise entière. */
    val crop: NormalizedCrop? = null,
    /** Le preset de proportions choisi ; `null` ⇒ un recadrage libre. */
    val cropPreset: ComposerCropPreset? = null,
    /** La coupe et le son d'une vidéo ; `null` pour une photo. */
    val video: ComposerVideoEdit? = null,
) {
    /** (x) et « Terminé » cèdent la place aux éléments d'édition. */
    val showsTopRow: Boolean
        get() = ComposerEditTools.showsTopRow(openFamily != null, activeTools.filter { ComposerEditTools.isShown(it, activeTools, openFamily != null) }.toSet())

    /** Toucher une famille l'ouvre ; la toucher ouverte la referme. Une famille absente du rail ne s'ouvre pas. */
    public fun tappingFamily(family: ComposerLookFamily): ComposerRetouchState = when {
        settled || family !in families -> this
        openFamily == family -> copy(openFamily = null)
        else -> copy(openFamily = family)
    }

    /** Choisir une case : filtre, effet et cadre se combinent. */
    public fun choosing(item: ComposerLookStripItem): ComposerRetouchState =
        if (settled) this else copy(look = ComposerLookStripRule.look(item, look))

    /** Toucher un outil ne touche que lui ; un outil que la prise n'offre pas ne bouge rien. */
    public fun tappingTool(tool: ComposerEditTool): ComposerRetouchState {
        if (settled || tool !in tools) return this
        val familyOpen = openFamily != null
        val next = ComposerEditTools.toggled(activeTools, tool, familyOpen)
        return copy(activeTools = next, openFamily = if (familyOpen && tool != ComposerEditTool.CROP) null else openFamily)
    }

    /** Un preset de proportions recadre la prise au plus grand, centré ; « Original » sur une prise entière ne recadre rien. */
    public fun choosingPreset(preset: ComposerCropPreset, sourceWidth: Int, sourceHeight: Int): ComposerRetouchState {
        if (settled) return this
        val aspect = preset.aspect(sourceWidth.toDouble(), sourceHeight.toDouble())
        return copy(cropPreset = preset, crop = ComposerCropPreset.centeredCrop(aspect, sourceWidth.toDouble(), sourceHeight.toDouble()))
    }

    /** Les équerres tirées à la main : un recadrage libre (le preset ne tient plus que s'il est réalisé). */
    public fun cropping(to: NormalizedCrop?, sourceWidth: Int, sourceHeight: Int): ComposerRetouchState {
        if (settled) return this
        val aspect = to?.let { (it.width * sourceWidth).toDouble() / (it.height * sourceHeight) }
        val preset = aspect?.let { ComposerCropPreset.matching(it, sourceWidth.toDouble(), sourceHeight.toDouble()) }
        return copy(crop = to, cropPreset = preset)
    }

    /** La coupe : la fenêtre gardée, poignées jamais croisées (`MediaTrimRule`). */
    public fun trimming(bounds: MediaTrimBounds): ComposerRetouchState {
        val edit = video ?: return this
        if (settled) return this
        val served = MediaTrimRule.resolved(bounds.start, bounds.end, edit.durationSeconds)
        return copy(video = edit.copy(trim = served))
    }

    public fun settingGain(gain: Double): ComposerRetouchState {
        val edit = video ?: return this
        return if (settled) this else copy(video = edit.copy(sound = edit.sound.copy(gain = ComposerTakeSound.clamped(gain))))
    }

    public fun togglingMute(): ComposerRetouchState {
        val edit = video ?: return this
        return if (settled) this else copy(video = edit.copy(sound = edit.sound.toggledMute()))
    }

    /** « Terminé » : ce qui part. Une prise intouchée rend les octets d'origine, jamais un ré-encodage. */
    public val delivery: ComposerRetouchDelivery
        get() = if (look.isUntouched && crop == null && (video?.isUntouched ?: true)) ComposerRetouchDelivery.ORIGINAL else ComposerRetouchDelivery.RENDERED

    /** La réponse à l'hôte — « Terminé », « Annuler » — part une seule fois : la seconde est refusée. */
    public fun settling(): ComposerRetouchState? = if (settled) null else copy(settled = true, openFamily = null)

    public companion object {
        /** L'état d'entrée d'une prise : aucun outil ouvert, les familles que la plateforme sait peindre. */
        public fun opening(
            take: ComposerEditTake,
            renderableEffects: List<CallFaceEffect>,
            tools: List<ComposerEditTool>,
            durationSeconds: Double? = null,
            lookFamilies: Boolean = true,
        ): ComposerRetouchState =
            ComposerRetouchState(
                take = take,
                families = if (lookFamilies) ComposerLookStripRule.families(renderableEffects) else emptyList(),
                tools = ComposerEditTools.offered(take).filter { it in tools },
                activeTools = ComposerEditTools.initial(take),
                video = durationSeconds?.takeIf { take is ComposerEditTake.Video }?.let { ComposerVideoEdit(it) },
            )
    }
}
