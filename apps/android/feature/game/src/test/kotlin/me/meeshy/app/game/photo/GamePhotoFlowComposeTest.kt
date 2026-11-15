package me.meeshy.app.game.photo

import android.content.Context
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.PhotoStepEmblem
import me.meeshy.sdk.model.game.photo.CameraFailure
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.PhotoFlowState
import me.meeshy.sdk.model.game.photo.PhotoMode
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * L'atelier photo (iOS `GamePhotoFlowView`) : Mee propose Selfie, Carte seule, Plus tard ; la carte seule se frappe et
 * mène au résultat — Partager, Garder dans la Chronique ; une caméra refusée le dit sans fermer la porte de la carte.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GamePhotoFlowComposeTest {

    @get:Rule val compose = createComposeRule()

    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private val moment = GamePhotoMoment("start", PhotoStepEmblem.Start)

    @androidx.compose.runtime.Composable
    private fun Still(content: @androidx.compose.runtime.Composable () -> Unit) {
        MeeshyTheme { androidx.compose.runtime.CompositionLocalProvider(me.meeshy.ui.accessibility.LocalReduceMotion provides true, content = content) }
    }

    @Test
    fun `mee propose le selfie la carte seule et plus tard`() {
        var selfies = 0
        val session = fakeSession(moment)
        compose.setContent { Still { GamePhotoFlow(session, onClose = {}, onSelfie = { selfies++ }, onGallery = {}, onShare = {}) } }

        compose.onNodeWithText(context.getString(R.string.game_photo_offer_title)).assertExists()
        compose.onNodeWithText("Le titre du moment").assertExists()
        compose.onNodeWithTag(PHOTO_CARD_TAG).assertHasClickAction()
        compose.onNodeWithTag(PHOTO_LATER_TAG).assertHasClickAction()
        compose.onNodeWithTag(PHOTO_SELFIE_TAG).performClick()

        compose.runOnIdle { check(selfies == 1) { "« Selfie avec nous » n'a pas demandé la caméra" } }
    }

    @Test
    fun `la carte seule mene au resultat et garder la range dans la chronique`() {
        val notebook = FakePhotoNotebook()
        val session = fakeSession(moment, notebook = notebook)
        var shared: ByteArray? = null
        compose.setContent { Still { GamePhotoFlow(session, onClose = {}, onSelfie = {}, onGallery = {}, onShare = { shared = it }) } }

        compose.onNodeWithTag(PHOTO_CARD_TAG).performClick()
        compose.waitUntil(5_000) { session.state is PhotoFlowState.Result }

        compose.onNodeWithTag(PHOTO_SHARE_TAG).performClick()
        compose.onNodeWithTag(PHOTO_KEEP_TAG).performClick()
        compose.waitUntil(5_000) { notebook.kept.isNotEmpty() }

        compose.onNodeWithTag(PHOTO_NOTICE_TAG).assertExists()
        compose.runOnIdle {
            check(shared?.toList() == listOf<Byte>(1)) { "Partager n'a pas remis la story" }
            check(session.state == PhotoFlowState.Result(PhotoMode.Card, kept = true))
        }
    }

    @Test
    fun `plus tard ferme l atelier et laisse le moment en attente`() {
        val notebook = FakePhotoNotebook()
        val session = fakeSession(moment, notebook = notebook)
        var closed = 0
        compose.setContent { Still { GamePhotoFlow(session, onClose = { closed++ }, onSelfie = {}, onGallery = {}, onShare = {}) } }

        compose.onNodeWithTag(PHOTO_LATER_TAG).performClick()

        compose.waitUntil(5_000) { closed == 1 }
        compose.runOnIdle { check(notebook.postponed == listOf(moment)) }
    }

    @Test
    fun `une camera refusee le dit et la carte seule reste offerte`() {
        val session = fakeSession(moment, camera = FakeCamera(failure = CameraFailure.Denied))
        compose.setContent { Still { GamePhotoFlow(session, onClose = {}, onSelfie = {}, onGallery = {}, onShare = {}) } }

        kotlinx.coroutines.runBlocking { session.chooseSelfie() }

        compose.onNodeWithTag(PHOTO_CAMERA_FAILURE_TAG).assertExists()
        compose.onNodeWithText(context.getString(R.string.game_photo_camera_denied)).assertExists()
        compose.onNodeWithContentDescription(context.getString(R.string.game_photo_card_only)).assertHasClickAction()
    }
}
