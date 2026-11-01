package me.meeshy.sdk.media.scene

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.CaptureGallery
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.composer.scene.SceneExportState
import me.meeshy.sdk.model.scene.export.StoryExportSlide
import me.meeshy.sdk.model.scene.export.StoryExportTimelinePlan
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

@OptIn(ExperimentalCoroutinesApi::class)
class SceneExportCoordinatorTest {

    @get:Rule
    val folder = TemporaryFolder()

    private class FakeRunner(
        private val gate: CompletableDeferred<Unit>? = null,
        private val failure: Throwable? = null,
    ) : SceneTransformRunner {
        val jobs = mutableListOf<SceneExportJob>()

        override suspend fun run(job: SceneExportJob, onProgress: (Float) -> Unit) {
            jobs += job
            job.output.writeText("partiel")
            onProgress(0.5f)
            gate?.await()
            failure?.let { throw it }
            job.output.writeText("complet")
            onProgress(1f)
        }
    }

    private class FakeGallery(private val accepts: Boolean = true) : CaptureGallery {
        val videos = mutableListOf<String>()
        val images = mutableListOf<Pair<String, String>>()
        override suspend fun saveImage(jpeg: ByteArray, displayName: String): Boolean {
            images += displayName to String(jpeg)
            return accepts
        }
        override suspend fun saveVideo(file: File, displayName: String): Boolean {
            videos += displayName
            return accepts
        }
    }

    private fun TestScope.coordinator(
        runner: SceneTransformRunner,
        gallery: CaptureGallery = FakeGallery(),
        report: (Throwable) -> Unit = {},
        proof: SceneExportProof = SceneExportProof.NONE,
    ) =
        SceneExportCoordinator(
            runner = runner,
            gallery = gallery,
            tempDirectory = folder.newFolder(),
            scope = this,
            dispatcher = StandardTestDispatcher(testScheduler),
            nowMillis = { 1_700_000_000_000L },
            report = report,
            proof = proof,
        )

    private fun job(output: File, still: File? = null, release: () -> Unit = {}) = SceneExportJob(
        plan = StoryExportTimelinePlan(listOf(StoryExportSlide(0, 0, 3_000)), emptyList(), still = false),
        format = StoryExportVideoFormat.of(),
        fills = emptyList(),
        overlays = emptyList(),
        sounds = emptyMap(),
        output = output,
        release = release,
        still = still,
    )

    @Test
    fun `la galerie recoit le fichier puis le temporaire est efface`() = runTest {
        val gallery = FakeGallery()
        val c = coordinator(FakeRunner(), gallery)
        c.export(SceneExportDestination.GALLERY) { out, _ -> job(out) }
        advanceUntilIdle()
        assertThat(c.state.value).isEqualTo(SceneExportState.Saved)
        assertThat(gallery.videos).containsExactly("meeshy-scene-1700000000000.mp4")
        assertThat(folder.root.walkTopDown().filter { it.isFile }.toList()).isEmpty()
    }

    @Test
    fun `une galerie qui refuse est un echec et rien ne traine`() = runTest {
        val c = coordinator(FakeRunner(), FakeGallery(accepts = false))
        c.export(SceneExportDestination.GALLERY) { out, _ -> job(out) }
        advanceUntilIdle()
        assertThat(c.state.value).isEqualTo(SceneExportState.Failed)
        assertThat(folder.root.walkTopDown().filter { it.isFile }.toList()).isEmpty()
    }

    @Test
    fun `le partage garde le fichier jusqu a la fermeture de la feuille`() = runTest {
        val c = coordinator(FakeRunner())
        c.export(SceneExportDestination.SHARE) { out, _ -> job(out) }
        advanceUntilIdle()
        val ready = c.state.value as SceneExportState.Ready
        assertThat(File(ready.path).readText()).isEqualTo("complet")
        c.finishSharing()
        assertThat(File(ready.path).exists()).isFalse()
        assertThat(c.state.value).isEqualTo(SceneExportState.Idle)
    }

    @Test
    fun `un echec du moteur efface le fichier partiel`() = runTest {
        val c = coordinator(FakeRunner(failure = IllegalStateException("codec")))
        c.export(SceneExportDestination.SHARE) { out, _ -> job(out) }
        advanceUntilIdle()
        assertThat(c.state.value).isEqualTo(SceneExportState.Failed)
        assertThat(folder.root.walkTopDown().filter { it.isFile }.toList()).isEmpty()
    }

    @Test
    fun `annuler en plein bake arrete le moteur, efface le partiel et rend le repos`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val runner = FakeRunner(gate = gate)
        val c = coordinator(runner)
        c.export(SceneExportDestination.SHARE) { out, _ -> job(out) }
        runCurrent()
        assertThat((c.state.value as SceneExportState.Running).fraction).isEqualTo(0.5f)
        c.cancel()
        advanceUntilIdle()
        assertThat(c.state.value).isEqualTo(SceneExportState.Idle)
        assertThat(folder.root.walkTopDown().filter { it.isFile }.toList()).isEmpty()
    }

    @Test
    fun `un second export pendant le bake est ignore`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val runner = FakeRunner(gate = gate)
        val c = coordinator(runner)
        c.export(SceneExportDestination.SHARE) { out, _ -> job(out) }
        runCurrent()
        c.export(SceneExportDestination.GALLERY) { out, _ -> job(out) }
        gate.complete(Unit)
        advanceUntilIdle()
        assertThat(runner.jobs).hasSize(1)
    }

    @Test
    fun `une preparation qui echoue (media introuvable) est un echec propre`() = runTest {
        val c = coordinator(FakeRunner())
        c.export(SceneExportDestination.SHARE) { _, _ -> error("fond introuvable") }
        advanceUntilIdle()
        assertThat(c.state.value).isEqualTo(SceneExportState.Failed)
    }

    @Test
    fun `un echec de preparation est journalise avec sa cause au lieu d etre avale`() = runTest {
        val reported = mutableListOf<Throwable>()
        val cause = java.io.IOException("statut 404")
        val c = coordinator(FakeRunner(), report = { reported += it })
        c.export(SceneExportDestination.GALLERY) { _, _ -> throw cause }
        advanceUntilIdle()
        assertThat(c.state.value).isEqualTo(SceneExportState.Failed)
        assertThat(reported).containsExactly(cause)
    }

    @Test
    fun `un echec du moteur et un refus de la galerie sont journalises`() = runTest {
        val reported = mutableListOf<Throwable>()
        val codec = IllegalStateException("codec")
        coordinator(FakeRunner(failure = codec), report = { reported += it })
            .export(SceneExportDestination.SHARE) { out, _ -> job(out) }
        advanceUntilIdle()
        coordinator(FakeRunner(), FakeGallery(accepts = false), report = { reported += it })
            .export(SceneExportDestination.GALLERY) { out, _ -> job(out) }
        advanceUntilIdle()
        assertThat(reported.first()).isSameInstanceAs(codec)
        assertThat(reported.last().message).contains("galerie")
        assertThat(reported).hasSize(2)
    }

    @Test
    fun `une annulation n est pas un echec et ne se journalise pas`() = runTest {
        val reported = mutableListOf<Throwable>()
        val c = coordinator(FakeRunner(gate = CompletableDeferred()), report = { reported += it })
        c.export(SceneExportDestination.SHARE) { out, _ -> job(out) }
        runCurrent()
        c.cancel()
        advanceUntilIdle()
        assertThat(reported).isEmpty()
    }

    @Test
    fun `le message d echec acquitte rend le repos et permet de relancer`() = runTest {
        val c = coordinator(FakeRunner(failure = IllegalStateException("x")))
        c.export(SceneExportDestination.SHARE) { out, _ -> job(out) }
        advanceUntilIdle()
        c.acknowledge()
        assertThat(c.state.value).isEqualTo(SceneExportState.Idle)
    }

    @Test
    fun `le dossier de travail est efface avec le bake, reussi ou non`() = runTest {
        val seen = mutableListOf<File>()
        val c = coordinator(FakeRunner(failure = IllegalStateException("x")))
        c.export(SceneExportDestination.SHARE) { out, work ->
            work.mkdirs()
            File(work, "fond.png").writeText("png")
            seen += work
            job(out)
        }
        advanceUntilIdle()
        assertThat(seen.single().exists()).isFalse()
    }

    @Test
    fun `remis a une autre appli, le fichier reste et le prochain export balaie le dossier`() = runTest {
        val c = coordinator(FakeRunner())
        c.export(SceneExportDestination.SHARE) { out, _ -> job(out) }
        advanceUntilIdle()
        val shared = File((c.state.value as SceneExportState.Ready).path)
        c.handedOver()
        assertThat(c.state.value).isEqualTo(SceneExportState.Idle)
        assertThat(shared.exists()).isTrue()
        c.export(SceneExportDestination.GALLERY) { out, _ -> job(out) }
        advanceUntilIdle()
        assertThat(shared.exists()).isFalse()
    }

    @Test
    fun `le calque peint est libere quand le bake s arrete, quelle qu en soit la raison`() = runTest {
        var released = 0
        val c = coordinator(FakeRunner(failure = IllegalStateException("x")))
        c.export(SceneExportDestination.SHARE) { out, _ ->
            job(out, release = { released++ })
        }
        advanceUntilIdle()
        assertThat(released).isEqualTo(1)
    }

    @Test
    fun `une scene fixe sort en image dans la galerie, sans passer par le moteur video`() = runTest {
        val gallery = FakeGallery()
        val runner = FakeRunner()
        val c = coordinator(runner, gallery)
        c.export(SceneExportDestination.GALLERY) { out, work ->
            work.mkdirs()
            job(out, still = File(work, "scene.jpg").apply { writeText("jpeg") })
        }
        advanceUntilIdle()
        assertThat(c.state.value).isEqualTo(SceneExportState.Saved)
        assertThat(runner.jobs).isEmpty()
        assertThat(gallery.images).containsExactly("meeshy-scene-1700000000000.jpg" to "jpeg")
        assertThat(gallery.videos).isEmpty()
        assertThat(folder.root.walkTopDown().filter { it.isFile }.toList()).isEmpty()
    }

    @Test
    fun `partager une scene fixe remet son image`() = runTest {
        val c = coordinator(FakeRunner())
        c.export(SceneExportDestination.SHARE) { out, work ->
            work.mkdirs()
            job(out, still = File(work, "scene.jpg").apply { writeText("jpeg") })
        }
        advanceUntilIdle()
        val ready = c.state.value as SceneExportState.Ready
        assertThat(ready.path).endsWith(".jpg")
        assertThat(File(ready.path).readText()).isEqualTo("jpeg")
    }

    @Test
    fun `un rendu qui ne montre pas sa scene echoue en le disant, et ne part pas a la galerie`() = runTest {
        val gallery = FakeGallery()
        val reported = mutableListOf<Throwable>()
        val black = IllegalStateException("la vidéo rendue est noire (6 instants relus) alors que le calque des objets de 0 à 4000 ms se voit à 1000 ms")
        val c = coordinator(FakeRunner(), gallery, report = { reported += it }, proof = { throw black })
        c.export(SceneExportDestination.GALLERY) { out, _ -> job(out) }
        advanceUntilIdle()
        assertThat(c.state.value).isEqualTo(SceneExportState.Failed)
        assertThat(gallery.videos).isEmpty()
        assertThat(reported).containsExactly(black)
        assertThat(folder.root.walkTopDown().filter { it.isFile }.toList()).isEmpty()
    }

    @Test
    fun `pendant la relecture du rendu, l etat dit qu il verifie et un echec s annonce`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val seen = mutableListOf<SceneExportState>()
        lateinit var c: SceneExportCoordinator
        c = coordinator(FakeRunner(), proof = { seen += c.state.value; gate.await(); throw IllegalStateException("noire") })
        c.export(SceneExportDestination.GALLERY) { out, _ -> job(out) }
        advanceUntilIdle()

        assertThat(seen.single().isVerifying).isTrue()
        assertThat(c.state.value.isVerifying).isTrue()
        assertThat(c.state.value.veilFraction).isEqualTo(1f)

        gate.complete(Unit)
        advanceUntilIdle()
        assertThat(c.state.value).isEqualTo(SceneExportState.Failed)
    }

    @Test
    fun `la preuve relit le rendu termine, avant la remise`() = runTest {
        val read = mutableListOf<String>()
        val c = coordinator(FakeRunner(), proof = { job -> read += job.output.readText() })
        c.export(SceneExportDestination.GALLERY) { out, _ -> job(out) }
        advanceUntilIdle()
        assertThat(read).containsExactly("complet")
        assertThat(c.state.value).isEqualTo(SceneExportState.Saved)
    }
}
