package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.net.Uri
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.util.BitmapLoader
import androidx.media3.transformer.AssetLoader
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ImageAssetLoader
import androidx.media3.transformer.SampleConsumer
import com.google.common.truth.Truth.assertThat
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import java.io.File
import me.meeshy.sdk.model.scene.export.StoryExportBrandingPlan
import me.meeshy.sdk.model.scene.export.StoryExportClipRange
import me.meeshy.sdk.model.scene.export.StoryExportSlide
import me.meeshy.sdk.model.scene.export.StoryExportSound
import me.meeshy.sdk.model.scene.export.StoryExportSoundRole
import me.meeshy.sdk.model.scene.export.StoryExportTimelinePlan
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13986 — sur le S8, « ⋯ › Enregistrer » d'un brouillon de quatre scènes, la quatrième à fond vidéo, finissait en
 * `IllegalStateException` dans `ImageAssetLoader.<init>` : Media3 1.4.1 exige d'un [EditedMediaItem] d'IMAGE une durée
 * (`durationUs`) et une cadence (`frameRate`), et ne lit pas `MediaItem.imageDurationMs`. La composition RÉELLE d'un
 * brouillon mixte passe ici chaque image au chargeur d'images de Media3, celui qui refusait sur l'appareil.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class Media3SceneCompositionTest {

    private val format = StoryExportVideoFormat.of()

    private fun mixedDraft(branding: SceneExportBranding? = null): SceneExportJob {
        val plan = StoryExportTimelinePlan(
            listOf(StoryExportSlide(0, 0, 4_000), StoryExportSlide(1, 4_000, 9_000), StoryExportSlide(2, 9_000, 13_000), StoryExportSlide(3, 13_000, 18_000)),
            listOf(StoryExportSound("v", StoryExportSoundRole.FOREGROUND_AUDIO, "v", 1_000, 5_000, 0, null, false, 0.8f)),
            still = false,
        )
        val fills = listOf(
            SceneExportSlideFill.Picture(File("fond-0.png")),
            SceneExportSlideFill.Picture(File("fond-1.png")),
            SceneExportSlideFill.Picture(File("fond-2.png")),
            SceneExportSlideFill.Video(File("20261031_131911.mp4"), listOf(StoryExportClipRange(0, 3_000)), SceneExportHold(File("fin-3.png"), 2_000)),
        )
        return SceneExportJob(
            plan, format, fills, overlays = emptyList(),
            sounds = mapOf("v" to SceneExportSoundFile(File("vocal.m4a"), 4_000)), output = File("out.mp4"), branding = branding,
        )
    }

    private fun branding() = SceneExportBranding(
        plan = StoryExportBrandingPlan.make(true, true),
        introCard = File("intro.png"),
        outroCard = File("fin.png"),
        authorCard = File("auteur.png"),
        introJingle = File("jingle-ouverture.wav"),
        introJingleMillis = 2_200,
        outroJingle = File("jingle-fermeture.wav"),
        outroJingleMillis = 2_000,
    )

    private object Undecoded : BitmapLoader {
        override fun supportsMimeType(mimeType: String): Boolean = true
        override fun decodeBitmap(data: ByteArray): ListenableFuture<Bitmap> = Futures.immediateFailedFuture(UnsupportedOperationException())
        override fun loadBitmap(uri: Uri): ListenableFuture<Bitmap> = Futures.immediateFailedFuture(UnsupportedOperationException())
    }

    private object Silent : AssetLoader.Listener {
        override fun onDurationUs(durationUs: Long) = Unit
        override fun onTrackCount(trackCount: Int) = Unit
        override fun onTrackAdded(inputFormat: Format, supportedOutputTypes: Int): Boolean = false
        override fun onOutputFormat(format: Format): SampleConsumer? = null
        override fun onError(exportException: ExportException) = Unit
    }

    private fun imagesOf(job: SceneExportJob): List<Pair<SceneVideoItem, EditedMediaItem>> =
        SceneCompositionPlanner.of(job).video.zip(Media3SceneComposition.of(job).sequences.first().editedMediaItems)
            .filter { (planned, _) -> planned.clip == null }

    private fun assertMedia3LoadsEveryImage(job: SceneExportJob, expectedImages: Int) {
        val images = imagesOf(job)
        assertThat(images).hasSize(expectedImages)
        images.forEach { (planned, item) ->
            ImageAssetLoader.Factory(Undecoded)
                .createAssetLoader(item, Looper.getMainLooper(), Silent, AssetLoader.CompositionSettings(Composition.HDR_MODE_KEEP_HDR, false))
                .release()
            assertThat(item.durationUs).isEqualTo(planned.imageMillis!! * 1_000)
            assertThat(item.frameRate).isEqualTo(format.fps)
        }
    }

    @Test
    fun `chaque image d un brouillon mixte porte la duree et la cadence que Media3 exige`() {
        assertMedia3LoadsEveryImage(mixedDraft(), expectedImages = 4)
    }

    @Test
    fun `l intro et la carte de fin d une story encadree se chargent aussi`() {
        assertMedia3LoadsEveryImage(mixedDraft(branding()), expectedImages = 6)
    }

    @Test
    fun `les tours de la video de fond restent une plage sans son, sans duree imposee`() {
        val job = mixedDraft()
        val laps = SceneCompositionPlanner.of(job).video.zip(Media3SceneComposition.of(job).sequences.first().editedMediaItems)
            .filter { (planned, _) -> planned.clip != null }
            .map { (_, item) -> item }
        assertThat(laps).hasSize(1)
        assertThat(laps.single().removeAudio).isTrue()
        assertThat(laps.single().durationUs).isEqualTo(C.TIME_UNSET)
        assertThat(laps.single().mediaItem.clippingConfiguration.endPositionMs).isEqualTo(3_000)
    }
}
