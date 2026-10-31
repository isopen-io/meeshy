package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaFraming
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import org.junit.Test

/**
 * #13841 : le look opaque d'un média (`StoryMediaLook`) lu et écrit par les familles de la retouche — les MÊMES
 * chaînes qu'iOS (`ComposerMediaLookMapping`) : `VideoFilterPreset.rawValue`, `classic:<style>` / `frame:<id>`,
 * `CallFaceEffect.rawValue`.
 */
class StoryMediaLookMappingTest {

    private val polaroid = ComposerPhotoFrame.Montage(CallMontageChoice.Classic(CallMontageStyle.POLAROID))
    private val liveFrame: ComposerPhotoFrame.Montage = ComposerLookStripRule.items(ComposerLookFamily.FRAMES)
        .map { (it as ComposerLookStripItem.Frame).frame }
        .filterIsInstance<ComposerPhotoFrame.Montage>()
        .first { it.choice is CallMontageChoice.Frame }

    @Test
    fun `les identifiants ecrits sont ceux d iOS`() {
        val look = StoryMediaLookMapping.storyLook(ComposerPhotoLook(VideoFilterPreset.Warm, polaroid, CallFaceEffect.ANGEL))

        assertThat(look).isEqualTo(StoryMediaLook(filterPreset = "warm", frameId = "classic:polaroid", faceEffect = "angel"))
        val id = (liveFrame.choice as CallMontageChoice.Frame).id
        assertThat(StoryMediaLookMapping.storyLook(ComposerPhotoLook(frame = liveFrame))).isEqualTo(StoryMediaLook(frameId = "frame:$id"))
    }

    @Test
    fun `naturel, aucun cadre et aucun effet ne s ecrivent pas`() {
        assertThat(StoryMediaLookMapping.storyLook(ComposerPhotoLook())).isNull()
    }

    @Test
    fun `un look se relit dans les familles de la retouche`() {
        val read = StoryMediaLookMapping.photoLook(StoryMediaLook(filterPreset = "vivid", frameId = "classic:polaroid", faceEffect = "toad"))

        assertThat(read).isEqualTo(ComposerPhotoLook(VideoFilterPreset.Vivid, polaroid, CallFaceEffect.TOAD))
    }

    @Test
    fun `un identifiant inconnu se peint aucun`() {
        val read = StoryMediaLookMapping.photoLook(StoryMediaLook(filterPreset = "sepia-2027", frameId = "frame:inconnu", faceEffect = "wizard"))

        assertThat(read).isEqualTo(ComposerPhotoLook())
        assertThat(StoryMediaLookMapping.photoLook(StoryMediaLook(frameId = "classic:hologram"))).isEqualTo(ComposerPhotoLook())
        assertThat(StoryMediaLookMapping.photoLook(StoryMediaLook(frameId = "polaroid"))).isEqualTo(ComposerPhotoLook())
    }

    @Test
    fun `choisir une case garde les autres familles, inconnues comprises`() {
        val current = StoryMediaLook(frameId = "frame:futur", faceEffect = "angel", framing = StoryMediaFraming(0.4, 0.5, 2.0))

        val next = StoryMediaLookMapping.choosing(ComposerLookStripItem.Filter(VideoFilterPreset.Cool), current)

        assertThat(next).isEqualTo(current.copy(filterPreset = "cool"))
    }

    @Test
    fun `choisir aucun efface sa famille, et un look revenu au neutre disparait`() {
        val current = StoryMediaLook(frameId = "classic:polaroid")

        assertThat(StoryMediaLookMapping.choosing(ComposerLookStripItem.Frame(ComposerPhotoFrame.None), current)).isNull()
        assertThat(StoryMediaLookMapping.choosing(ComposerLookStripItem.Effect(CallFaceEffect.SMOOTHING), null))
            .isEqualTo(StoryMediaLook(faceEffect = "smoothing"))
    }

    @Test
    fun `un look peint s il change des pixels`() {
        assertThat(StoryMediaLookMapping.paints(null)).isFalse()
        assertThat(StoryMediaLookMapping.paints(StoryMediaLook(filterPreset = "inconnu"))).isFalse()
        assertThat(StoryMediaLookMapping.paints(StoryMediaLook(filterPreset = "warm"))).isTrue()
        assertThat(StoryMediaLookMapping.paints(StoryMediaLook(framing = StoryMediaFraming(0.5, 0.5, 2.0)))).isTrue()
    }

    @Test
    fun `le cadrage se lit en fenetre de la source, y vers le haut, aux proportions de la source`() {
        assertThat(StoryMediaLookMapping.framingCrop(null)).isNull()
        assertThat(StoryMediaLookMapping.framingCrop(StoryMediaFraming.IDENTITY)).isNull()
        assertThat(StoryMediaLookMapping.framingCrop(StoryMediaFraming(0.5, 0.5, 2.0))).isEqualTo(NormalizedCrop(0.25f, 0.25f, 0.5f, 0.5f))
        assertThat(StoryMediaLookMapping.framingCrop(StoryMediaFraming(0.25, 0.75, 2.0))).isEqualTo(NormalizedCrop(0f, 0f, 0.5f, 0.5f))
        assertThat(StoryMediaLookMapping.framingCrop(StoryMediaFraming(1.0, 0.0, 4.0))).isEqualTo(NormalizedCrop(0.75f, 0.75f, 0.25f, 0.25f))
    }
}
