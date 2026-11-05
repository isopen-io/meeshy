package me.meeshy.app.game.photo

import android.graphics.Bitmap
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.game.PhotoStepEmblem
import me.meeshy.sdk.model.game.photo.CameraFailure
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.PhotoCameraPhase
import me.meeshy.sdk.model.game.photo.PhotoFlowState
import me.meeshy.sdk.model.game.photo.PhotoMode
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Les refus de la caméra se nomment, et aucun n'est une impasse : la galerie et la carte seule restent possibles. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GamePhotoCameraStateTest {

    @get:Rule val compose = createComposeRule()

    @After fun settleFrames() {
        Snapshot.sendApplyNotifications()
        compose.waitForIdle()
    }

    private val moment = GamePhotoMoment("start", PhotoStepEmblem.Start)

    @Test
    fun `each refusal is named in the flow state`() = runTest {
        listOf(CameraFailure.Denied, CameraFailure.Unsupported, CameraFailure.Unavailable).forEach { failure ->
            val session = fakeSession(moment, camera = FakeCamera(failure = failure))

            session.chooseSelfie()

            assertThat(session.state).isEqualTo(PhotoFlowState.Camera(PhotoCameraPhase.Failed(failure)))
        }
    }

    @Test
    fun `a refusal leaves the card and the gallery possible`() = runTest {
        val gallery = fakeSession(moment, camera = FakeCamera(failure = CameraFailure.Denied))
        gallery.chooseSelfie()
        gallery.useGalleryPhoto(Bitmap.createBitmap(4, 8, Bitmap.Config.ARGB_8888))
        assertThat(gallery.composed).isNotNull()

        val card = fakeSession(moment, camera = FakeCamera(failure = CameraFailure.Unsupported))
        card.chooseSelfie()
        card.chooseCard()
        assertThat(card.state).isInstanceOf(PhotoFlowState.Result::class.java)
        assertThat((card.state as PhotoFlowState.Result).mode).isEqualTo(PhotoMode.Card)
    }

    @Test
    fun `a request without a source paints the brand card, a selfie is mirrored and a gallery photo is not`() {
        val text = PhotoCanvasText("k", "t", "d")
        val shot = Bitmap.createBitmap(4, 8, Bitmap.Config.ARGB_8888)

        assertThat(PhotoComposeRequest(moment, text, null, PhotoMode.Card).background).isEqualTo(PhotoBackground.Card)
        assertThat(PhotoComposeRequest(moment, text, shot, PhotoMode.Selfie).background)
            .isEqualTo(PhotoBackground.Photo(shot, mirrored = true))
        assertThat(PhotoComposeRequest(moment, text, shot, PhotoMode.Gallery).background)
            .isEqualTo(PhotoBackground.Photo(shot, mirrored = false))
    }
}
