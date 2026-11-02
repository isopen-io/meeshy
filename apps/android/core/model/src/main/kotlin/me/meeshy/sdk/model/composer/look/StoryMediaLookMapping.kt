package me.meeshy.sdk.model.composer.look

import me.meeshy.sdk.model.StoryMediaFraming
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.sdk.model.imageedit.NormalizedCrop

/**
 * **LE LOOK OPAQUE D'UN MÉDIA, LU PAR LES FAMILLES DE LA RETOUCHE** (#13841) — miroir de `ComposerMediaLookMapping`
 * (iOS, #13840) : les mêmes chaînes (`VideoFilterPreset.id`, `classic:<CallMontageStyle.raw>` / `frame:<id>`,
 * `CallFaceEffect.raw`). Un identifiant inconnu, ou un cadre que la retouche ne sait pas composer, se peint « aucun ».
 */
public object StoryMediaLookMapping {
    private const val CLASSIC = "classic"
    private const val FRAME = "frame"

    /** Le look écrit pour un rendu de la retouche ; `null` quand il ne peint rien. */
    public fun storyLook(look: ComposerPhotoLook, framing: StoryMediaFraming? = null): StoryMediaLook? =
        StoryMediaLook(
            filterPreset = filterId(look.filter),
            frameId = token(look.frame),
            faceEffect = effectId(look.effect),
            framing = framing,
        ).normalized

    /** Le rendu que la retouche peint pour ce look : ce qu'elle ne connaît pas se lit « aucun ». */
    public fun photoLook(look: StoryMediaLook?): ComposerPhotoLook = ComposerPhotoLook(
        filter = VideoFilterPreset.entries.firstOrNull { it.id == look?.filterPreset } ?: VideoFilterPreset.Natural,
        frame = frame(look?.frameId),
        effect = CallFaceEffect.entries.firstOrNull { it.raw == look?.faceEffect } ?: CallFaceEffect.NONE,
    )

    /** Le jeton d'un cadre — `null` pour « aucun cadre ». */
    public fun token(frame: ComposerPhotoFrame): String? = when (frame) {
        ComposerPhotoFrame.None -> null
        is ComposerPhotoFrame.Montage -> when (val choice = frame.choice) {
            is CallMontageChoice.Classic -> "$CLASSIC:${choice.style.raw}"
            is CallMontageChoice.Frame -> "$FRAME:${choice.id}"
        }
    }

    /** Le cadre d'un jeton ; « aucun » pour un jeton inconnu ou un cadre que la retouche ne compose pas. */
    public fun frame(token: String?): ComposerPhotoFrame {
        val kind = token?.substringBefore(':', missingDelimiterValue = "") ?: return ComposerPhotoFrame.None
        val value = token.substringAfter(':')
        val frame = when (kind) {
            CLASSIC -> CallMontageStyle.fromRaw(value)?.let { ComposerPhotoFrame.Montage(CallMontageChoice.Classic(it)) }
            FRAME -> ComposerPhotoFrame.Montage(CallMontageChoice.Frame(value)).takeIf { ComposerLiveLookRule.design(it) != null }
            else -> null
        }
        return frame ?: ComposerPhotoFrame.None
    }

    /**
     * **Choisir une case garde le reste du look** : seule la famille de la case change ; les autres gardent leur
     * identifiant tel quel — inconnu compris — et le cadrage n'est jamais perdu. `null` : le look revient au neutre.
     */
    public fun choosing(item: ComposerLookStripItem, current: StoryMediaLook?): StoryMediaLook? {
        val base = current ?: StoryMediaLook()
        val next = when (item) {
            is ComposerLookStripItem.Filter -> base.copy(filterPreset = filterId(item.preset))
            is ComposerLookStripItem.Effect -> base.copy(faceEffect = effectId(item.effect))
            is ComposerLookStripItem.Frame -> base.copy(frameId = token(item.frame))
        }
        return next.normalized
    }

    /** Le look change-t-il les pixels du média ? */
    public fun paints(look: StoryMediaLook?): Boolean =
        !photoLook(look).isUntouched || framingCrop(look?.framing) != null

    /**
     * La fenêtre de la source que le cadrage garde, aux proportions de la source (le look ne change jamais les
     * proportions d'un média) : `1 / scale` de chaque côté autour du centre, ramenée dans la source. `null` : la source entière.
     */
    public fun framingCrop(framing: StoryMediaFraming?): NormalizedCrop? {
        if (framing == null || framing.isIdentity) return null
        val scale = framing.scale.takeIf { it.isFinite() && it > 1.0 } ?: return null
        val side = (1.0 / scale).toFloat()
        val left = (framing.centerX.toFloat() - side / 2f).coerceIn(0f, 1f - side)
        val top = ((1.0 - framing.centerY).toFloat() - side / 2f).coerceIn(0f, 1f - side)
        return NormalizedCrop(left, top, side, side)
    }

    private fun filterId(preset: VideoFilterPreset): String? = preset.takeUnless { it == VideoFilterPreset.Natural }?.id

    private fun effectId(effect: CallFaceEffect): String? = effect.takeUnless { it == CallFaceEffect.NONE }?.raw
}
