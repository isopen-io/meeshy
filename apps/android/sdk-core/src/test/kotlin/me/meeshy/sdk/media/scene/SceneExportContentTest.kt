package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.scene.export.StoryExportClipRange
import me.meeshy.sdk.model.scene.export.StoryExportSlide
import me.meeshy.sdk.model.scene.export.StoryExportTimelinePlan
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import org.junit.Test

/**
 * #13986 — le S8 a enregistré une vidéo de 12 s entièrement noire en annonçant « Enregistré dans la photothèque ». Ce que la
 * vidéo rendue doit montrer se lit dans ses sources (fond, vidéo de fond, calque des objets, cartes) ; un rendu noir là où
 * une source se voit fait échouer l'export en nommant cette source.
 */
class SceneExportContentTest {

    private val video = File("20261031_131911.mp4")
    private val output = File("meeshy-scene.mp4")
    private val gradient = SceneExportOverlay.Stored(0, 4_000, File("calque-degrade.png"))
    private val darkBlue = SceneExportOverlay.Stored(4_000, 13_000, File("calque-bleu.png"))
    private val bare = SceneExportOverlay.Stored(13_000, 18_000, File("calque-vide.png"))

    /** Le brouillon du S8 : un dégradé coloré, deux bleus sombres, puis la vidéo de fond (3 s lues, 2 s tenues). */
    private fun draft() = SceneExportJob(
        plan = StoryExportTimelinePlan(
            listOf(StoryExportSlide(0, 0, 4_000), StoryExportSlide(1, 4_000, 5_000), StoryExportSlide(2, 9_000, 4_000), StoryExportSlide(3, 13_000, 5_000)),
            emptyList(),
            still = false,
        ),
        format = StoryExportVideoFormat.of(),
        fills = listOf(
            SceneExportSlideFill.Picture(File("fond-0.png")),
            SceneExportSlideFill.Picture(File("fond-1.png")),
            SceneExportSlideFill.Picture(File("fond-2.png")),
            SceneExportSlideFill.Video(video, listOf(StoryExportClipRange(0, 3_000)), SceneExportHold(File("fin-3.png"), 2_000)),
        ),
        overlays = listOf(gradient, darkBlue, bare),
        sounds = emptyMap(),
        output = output,
    )

    private class Measured(
        private val images: Map<String, Int>,
        private val source: Int,
        private val rendered: (Long) -> Int?,
    ) : SceneContentLuma {
        val readAt = mutableListOf<Long>()
        override fun image(file: File): Int? = images[file.name]
        override fun bitmap(bitmap: Bitmap): Int = 0
        override fun videoFrame(file: File, atMillis: Long): Int? =
            if (file.name == "meeshy-scene.mp4") rendered(atMillis).also { readAt += atMillis } else source
    }

    private val sources = mapOf("calque-degrade.png" to 140, "calque-bleu.png" to 24, "calque-vide.png" to 0, "fond-0.png" to 0, "fin-3.png" to 60)

    @Test
    fun `chaque instant attend son fond, sa video de fond a sa place et le calque qui le couvre`() {
        val job = draft()
        val planned = SceneCompositionPlanner.of(job)
        assertThat(SceneExportContent.expectedAt(job, planned, 2_000))
            .containsExactly(SceneContentProbe.Picture(File("fond-0.png")), SceneContentProbe.Layer(gradient)).inOrder()
        assertThat(SceneExportContent.expectedAt(job, planned, 15_000))
            .containsExactly(SceneContentProbe.VideoFrame(video, 2_000), SceneContentProbe.Layer(bare)).inOrder()
        assertThat(SceneExportContent.expectedAt(job, planned, 17_000))
            .containsExactly(SceneContentProbe.Picture(File("fin-3.png")), SceneContentProbe.Layer(bare)).inOrder()
    }

    @Test
    fun `les instants relus sont le milieu de tranches egales de la video`() {
        assertThat(SceneExportContent.sampleTimes(12_000)).containsExactly(1_000L, 3_000L, 5_000L, 7_000L, 9_000L, 11_000L).inOrder()
        assertThat(SceneExportContent.sampleTimes(0)).isEmpty()
    }

    @Test
    fun `la luminance compte l opacite, un bleu nuit se voit et le noir non`() {
        assertThat(SceneExportContent.luma(0xFFFFFFFF.toInt())).isEqualTo(255)
        assertThat(SceneExportContent.luma(0x00FFFFFF)).isEqualTo(0)
        assertThat(SceneExportContent.luma(0xFF000000.toInt())).isEqualTo(0)
        assertThat(SceneExportContent.luma(0xFF0B1A3A.toInt())).isGreaterThan(SceneExportContent.VISIBLE_LUMA)
        assertThat(SceneExportContent.maxLuma(intArrayOf(0xFF000000.toInt(), 0xFF0B1A3A.toInt()))).isGreaterThan(SceneExportContent.VISIBLE_LUMA)
    }

    @Test
    fun `un rendu tout noir sous un degrade colore fait echouer l export en nommant la source`() = runTest {
        val failure = runCatching { RenderedContentProof(Measured(sources, source = 90, rendered = { 0 })).verify(draft()) }.exceptionOrNull()
        assertThat(failure).isInstanceOf(IllegalStateException::class.java)
        assertThat(failure).hasMessageThat().contains("la vidéo rendue est noire à 6 instant(s) sur 6")
        assertThat(failure).hasMessageThat().contains("le calque des objets de 0 à 4000 ms se voit à 1500 ms")
    }

    @Test
    fun `un rendu qui montre sa scene passe, relu a six instants`() = runTest {
        val measured = Measured(sources, source = 90, rendered = { 120 })
        RenderedContentProof(measured).verify(draft())
        assertThat(measured.readAt).containsExactly(1_500L, 4_500L, 7_500L, 10_500L, 13_500L, 16_500L).inOrder()
    }

    @Test
    fun `une video de fond qui sort noire fait echouer l export meme quand les autres scenes se voient`() = runTest {
        val failure = runCatching {
            RenderedContentProof(Measured(sources, source = 90, rendered = { at -> if (at < 13_000) 120 else 0 })).verify(draft())
        }.exceptionOrNull()
        assertThat(failure).isInstanceOf(IllegalStateException::class.java)
        assertThat(failure).hasMessageThat().contains("noire à 2 instant(s) sur 6 : la vidéo 20261031_131911.mp4 à 500 ms se voit à 13500 ms")
    }

    @Test
    fun `une story noire reste exportable, et un rendu illisible n est pas garanti`() = runTest {
        val dark = sources.mapValues { 0 }
        RenderedContentProof(Measured(dark, source = 0, rendered = { 0 })).verify(draft())
        val unreadable = runCatching { RenderedContentProof(Measured(sources, source = 90, rendered = { null })).verify(draft()) }.exceptionOrNull()
        assertThat(unreadable).isInstanceOf(IllegalStateException::class.java)
        assertThat(unreadable).hasMessageThat().contains("ne se relit pas")
    }

    @Test
    fun `la ligne de journal dit ce qui part au moteur`() {
        val job = draft()
        assertThat(SceneCompositionPlanner.of(job).describe(job.overlays.size)).isEqualTo(
            "composition de 18000 ms : vidéo [image 4000 ms (fond-0.png), image 5000 ms (fond-1.png), image 4000 ms (fond-2.png), " +
                "plage 0–3000 ms de 20261031_131911.mp4, image 2000 ms (fin-3.png)], 0 séquence(s) son, 3 calque(s) d'objets, 0 carte(s) de marque",
        )
    }
}
