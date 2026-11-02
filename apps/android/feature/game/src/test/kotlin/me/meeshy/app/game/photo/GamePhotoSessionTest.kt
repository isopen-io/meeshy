package me.meeshy.app.game.photo

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.composer.capture.CaptureZone
import me.meeshy.sdk.model.game.PhotoStepEmblem
import me.meeshy.sdk.model.game.photo.CameraFailure
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.NotebookKeepOutcome
import me.meeshy.sdk.model.game.photo.NotebookStatus
import me.meeshy.sdk.model.game.photo.PhotoCameraPhase
import me.meeshy.sdk.model.game.photo.PhotoFlowState
import me.meeshy.sdk.model.game.photo.PhotoMode
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le déroulé d'une photo (iOS `GamePhotoSession`) : selfie par la case du cadre ⇒ la prise part dans la galerie ; par la
 * scène ⇒ elle reste dans l'app ; la carte seule ne garde aucune source ; un disque plein se dit ; « Plus tard » laisse
 * le moment en attente ; une caméra refusée se nomme.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GamePhotoSessionTest {

    /**
     * Le déroulé écrit des états Compose : ses écritures réveillent l'ordonnanceur d'images de l'interface. Sans
     * environnement Compose pour le servir, une image demandée resterait due et figerait les suites suivantes.
     */
    @get:Rule val compose = createComposeRule()

    @After fun settleFrames() {
        Snapshot.sendApplyNotifications()
        compose.waitForIdle()
    }

    private val moment = GamePhotoMoment("rank:polyglotte:3", PhotoStepEmblem.Start)
    private val story = byteArrayOf(1)
    private val square = byteArrayOf(2)
    private val composer = FakeComposer()
    private val requests get() = composer.requests

    private fun session(
        camera: FakeCamera = FakeCamera(),
        notebook: FakePhotoNotebook = FakePhotoNotebook(),
        gallery: FakeGallery = FakeGallery(),
        fails: Boolean = false,
    ) = fakeSession(moment, camera, composer.also { it.fails = fails }, notebook, gallery)

    @Test
    fun `la case du cadre prend le selfie et l enregistre dans la galerie`() = runTest {
        val gallery = FakeGallery()
        val s = session(gallery = gallery)

        s.chooseSelfie()
        assertThat(s.state).isEqualTo(PhotoFlowState.Camera(PhotoCameraPhase.Live))
        s.take(CaptureZone.FRAME)

        assertThat(s.state).isEqualTo(PhotoFlowState.Result(PhotoMode.Selfie, kept = null))
        assertThat(requests.single().source).isNotNull()
        assertThat(gallery.saved.map { it.second }).containsExactly("meeshy-rank_polyglotte_3-story.jpg")
        assertThat(s.notice).isEqualTo(PhotoNotice.Saved)
        assertThat(s.showsSave).isFalse()
    }

    @Test
    fun `la scene touchee prend le selfie sans l enregistrer et Enregistrer reste offert`() = runTest {
        val gallery = FakeGallery()
        val s = session(gallery = gallery)
        s.chooseSelfie()

        s.take(CaptureZone.OUTSIDE)

        assertThat(gallery.saved).isEmpty()
        assertThat(s.showsSave).isTrue()
        s.save()
        assertThat(gallery.saved.single().first).isEqualTo(story)
        assertThat(s.showsSave).isFalse()
    }

    @Test
    fun `changer de format rend Enregistrer et enregistre le carre`() = runTest {
        val gallery = FakeGallery()
        val s = session(gallery = gallery)
        s.chooseSelfie()
        s.take(CaptureZone.FRAME)

        s.chooseFormat(square = true)

        assertThat(s.showsSave).isTrue()
        assertThat(s.shareBytes()).isEqualTo(square)
        s.save()
        assertThat(gallery.saved.last().second).isEqualTo("meeshy-rank_polyglotte_3-square.jpg")
    }

    @Test
    fun `garder un selfie ecrit la source reduite et la recette en miroir`() = runTest {
        val notebook = FakePhotoNotebook()
        val s = session(notebook = notebook)
        s.chooseSelfie()
        s.take(CaptureZone.OUTSIDE)

        s.keep()

        val photo = notebook.kept.single().second
        assertThat(photo.source).isEqualTo(byteArrayOf(7))
        assertThat(photo.recipe.frameId).isEqualTo(moment.id)
        assertThat(photo.recipe.mirror).isTrue()
        assertThat(s.state).isEqualTo(PhotoFlowState.Result(PhotoMode.Selfie, kept = true))
        assertThat(s.notice).isEqualTo(PhotoNotice.Kept)
        assertThat(notebook.entries.single().status).isEqualTo(NotebookStatus.Kept)
    }

    @Test
    fun `la carte seule se frappe sans camera et ne garde aucune source`() = runTest {
        val notebook = FakePhotoNotebook()
        val s = session(notebook = notebook)

        s.chooseCard()
        s.keep()

        assertThat(requests.single().source).isNull()
        assertThat(notebook.kept.single().second.source).isNull()
        assertThat(notebook.kept.single().second.recipe.mirror).isNull()
    }

    @Test
    fun `un disque plein se dit et la photo n est pas gardee`() = runTest {
        val s = session(notebook = FakePhotoNotebook(keepOutcome = NotebookKeepOutcome.NoSpace))
        s.chooseCard()

        s.keep()

        assertThat(s.notice).isEqualTo(PhotoNotice.NoSpace)
        assertThat(s.state).isEqualTo(PhotoFlowState.Result(PhotoMode.Card, kept = false))
    }

    @Test
    fun `une galerie refusee rend Enregistrer`() = runTest {
        val s = session(gallery = FakeGallery(succeeds = false))
        s.chooseSelfie()

        s.take(CaptureZone.FRAME)

        assertThat(s.notice).isEqualTo(PhotoNotice.SaveFailed)
        assertThat(s.showsSave).isTrue()
    }

    @Test
    fun `une camera refusee se nomme et la carte reste possible`() = runTest {
        val s = session(camera = FakeCamera(failure = CameraFailure.Denied))

        s.chooseSelfie()
        assertThat(s.state).isEqualTo(PhotoFlowState.Camera(PhotoCameraPhase.Failed(CameraFailure.Denied)))
        s.take(CaptureZone.FRAME)
        assertThat(requests).isEmpty()

        s.chooseCard()
        assertThat(s.state).isEqualTo(PhotoFlowState.Result(PhotoMode.Card, kept = null))
    }

    @Test
    fun `plus tard laisse le moment en attente et rend la camera`() = runTest {
        val camera = FakeCamera()
        val notebook = FakePhotoNotebook()
        val s = session(camera = camera, notebook = notebook)

        s.later()

        assertThat(notebook.postponed).containsExactly(moment)
        assertThat(s.wasDeferred).isTrue()
        assertThat(camera.stops).isAtLeast(1)
    }

    @Test
    fun `une composition ratee se dit en echec`() = runTest {
        val s = session(fails = true)

        s.chooseCard()

        assertThat(s.state).isEqualTo(PhotoFlowState.Failed)
    }
}
