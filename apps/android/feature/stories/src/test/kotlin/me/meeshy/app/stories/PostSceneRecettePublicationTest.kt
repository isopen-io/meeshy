package me.meeshy.app.stories

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.sceneItems
import me.meeshy.ui.component.media.PlayerCensus
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.math.abs

/**
 * Recette S8 sur le post RÉEL « Recette 14200 texte du post » (staging, publié Story + Post d'un geste) : une scène sans fond
 * déclaré, un smiley, et un son de la bibliothèque (@recretrait_b) posé SUR la scène. Le document est celui que le staging sert,
 * à l'identique (onde raccourcie).
 *
 * - #14223 : la story montrait le dégradé de l'auteur, le post un fond NOIR, dans la carte du fil comme dans la fiche ;
 * - #13893 : dans la fiche, la barre 🔊 ⏸ basculait sans qu'aucune piste ne démarre.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PostSceneRecettePublicationTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val post: ApiPost = MeeshyApi.json.decodeFromString(
        ApiPost.serializer(),
        """{ "id": "6ae6eb53c3a14bd0e775613e", "type": "POST", "content": "Recette 14200 texte du post",
             "storyEffects": {"scenes":[{"objects":[
               {"id":"df0426b5-8e38-4e11-bed6-898be1d0789a","kind":"sticker","anchor":{"t":"free","x":0.5,"y":0.5},"plane":"fg","z":2,
                "transform":{"scale":1,"rotation":0,"opacity":1},"payload":{"emoji":"😀"}},
               {"id":"borrowed-6ada52e99bc6c72f73df09c4","kind":"audio","anchor":{"t":"free","x":0.5,"y":0.5},"plane":"content","z":1,
                "transform":{"scale":1,"rotation":0,"opacity":1},
                "payload":{"duration":5.023,"soundId":"6ada52e99bc6c72f73df09c4","soundAuthorUsername":"recretrait_b",
                           "soundCreatedAt":"2026-10-22T18:16:09.512Z","postMediaId":null,
                           "mediaURL":"/api/v1/static/3b5f3f05-b205-4cb4-91a1-966e2be3ca21.m4a","placement":null,
                           "waveformSamples":[0.21191406,0.12762451,0.12750244]}}
             ],"id":"s1"}],"v":3} }""",
    )

    private val item: StoryItem get() = requireNotNull(post.sceneItems()).items.single()

    private val projector = StorySlideProjector(STAGING_API)

    private fun viewModel(): RepostSceneViewModel {
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        return RepostSceneViewModel(session, MeeshyConfig(apiBaseUrl = STAGING_API))
    }

    @Test
    fun `the sound posed on the scene of the post resolves to the library file it plays`() {
        val slide = projector.project(item, ACCENT, NoContentPreferences)

        assertThat(listOfNotNull(slide.backgroundAudioUrl, slide.foregroundAudioUrl))
            .containsExactly("https://staging.meeshy.me/api/v1/static/3b5f3f05-b205-4cb4-91a1-966e2be3ca21.m4a")
    }

    @Test
    fun `the post scene, playing in its detail, starts a player for its sound`() {
        PlayerCensus.reset()
        compose.mainClock.autoAdvance = false
        compose.setContent {
            Box(Modifier.size(width = 90.dp, height = 160.dp)) {
                PostSceneCard(item = item, accentHex = ACCENT, live = true, muted = false, viewModel = viewModel())
            }
        }
        compose.waitForIdle()

        assertThat(PlayerCensus.created).isAtLeast(1)
    }

    @Test
    fun `a post scene that declares no background reads on its author gradient, not on black`() {
        compose.setContent {
            Box(Modifier.size(width = 90.dp, height = 160.dp)) {
                PostSceneCard(item = item, accentHex = ACCENT, live = false, viewModel = viewModel())
            }
        }
        compose.waitForIdle()
        val content = compose.activity.findViewById<android.view.ViewGroup>(android.R.id.content).getChildAt(0) as ComposeView
        val bitmap = Bitmap.createBitmap(content.width, content.height, Bitmap.Config.ARGB_8888)
        content.draw(Canvas(bitmap))
        val top = bitmap.asImageBitmap().toPixelMap()[4, 2]

        assertThat(top.isNear(Color(0xFF34D399))).isTrue()
    }

    private fun Color.isNear(other: Color): Boolean =
        abs(red - other.red) < 0.1f && abs(green - other.green) < 0.1f && abs(blue - other.blue) < 0.1f

    private companion object {
        const val STAGING_API = "https://staging.meeshy.me/api/v1/"
        const val ACCENT = "34D399"
    }
}
