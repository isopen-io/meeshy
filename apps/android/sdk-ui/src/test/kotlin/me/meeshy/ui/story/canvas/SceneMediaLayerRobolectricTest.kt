package me.meeshy.ui.story.canvas

import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import androidx.test.core.app.ApplicationProvider
import coil.Coil
import coil.ImageLoader
import coil.decode.DataSource
import coil.intercept.Interceptor
import coil.request.ImageResult
import coil.request.SuccessResult
import org.junit.After
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.scene.SceneLists
import me.meeshy.sdk.model.scene.SceneReaderLanguages
import me.meeshy.sdk.model.scene.SceneRenderItem
import me.meeshy.sdk.model.scene.SceneRenderMode
import me.meeshy.sdk.model.scene.SceneRenderPlanner
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SceneMediaLayerRobolectricTest {
    @get:Rule
    val compose = createComposeRule()

    private fun plan(media: StoryMediaObject): List<SceneRenderItem> =
        SceneRenderPlanner.plan(SceneLists(medias = listOf(media)), 0.0, SceneRenderMode.PLAY, SceneReaderLanguages.NONE)

    @After
    fun resetImages() {
        Coil.reset()
    }

    private fun servingEveryImage() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val loader = ImageLoader.Builder(context)
            .components {
                add(object : Interceptor {
                    override suspend fun intercept(chain: Interceptor.Chain): ImageResult = SuccessResult(
                        drawable = BitmapDrawable(context.resources, bitmap()),
                        request = chain.request,
                        dataSource = DataSource.MEMORY,
                    )
                })
            }
            .build()
        Coil.setImageLoader(loader)
    }

    private fun bitmap(): Bitmap = Bitmap.createBitmap(4, 4, Bitmap.Config.ARGB_8888)

    @Test
    fun `un media sans source ni bitmap est ignore`() {
        compose.setContent { SceneCanvas(items = plan(StoryMediaObject(id = "m"))) }
        compose.onAllNodesWithTag(SCENE_MEDIA_TAG).assertCountEquals(0)
    }

    @Test
    fun `une image retouchee en memoire est peinte sans adresse`() {
        val environment = SceneMediaEnvironment(bitmapOf = { bitmap() })
        compose.setContent { SceneCanvas(items = plan(StoryMediaObject(id = "m")), mediaEnvironment = environment) }
        compose.onAllNodesWithTag(SCENE_MEDIA_TAG).assertCountEquals(1)
    }

    @Test
    fun `le bitmap retouche remplace l ancienne version sans trou`() {
        val environment = mutableStateOf(SceneMediaEnvironment(bitmapOf = { bitmap() }))
        val items = plan(StoryMediaObject(id = "m", mediaURL = "https://x/a.jpg"))
        compose.setContent { SceneCanvas(items = items, mediaEnvironment = environment.value) }
        compose.onAllNodesWithTag(SCENE_MEDIA_TAG).assertCountEquals(1)
        environment.value = SceneMediaEnvironment(bitmapOf = { bitmap() })
        compose.waitForIdle()
        compose.onAllNodesWithTag(SCENE_MEDIA_TAG).assertCountEquals(1)
    }

    @Test
    fun `une image rognee et un gif animes sont peints`() {
        servingEveryImage()
        val items = plan(StoryMediaObject(id = "m", mediaURL = "https://x/a.gif", crop = StoryMediaCrop(0.1, 0.1, 0.5, 0.5)))
        compose.setContent { SceneCanvas(items = items) }
        compose.onAllNodesWithTag(SCENE_MEDIA_TAG).assertCountEquals(1)
    }

    @Test
    fun `une video montre son affiche immediatement sans lecteur`() {
        val environment = SceneMediaEnvironment(posterOf = { bitmap() }, playsVideo = false)
        val items = plan(StoryMediaObject(id = "v", mediaType = "video", mediaURL = "https://x/v.mp4"))
        compose.setContent { SceneCanvas(items = items, mediaEnvironment = environment) }
        compose.onAllNodesWithTag(SCENE_MEDIA_POSTER_TAG).assertCountEquals(1)
    }

    @Test
    fun `un file du lecteur absent de l appareil n est pas peint`() {
        val items = plan(StoryMediaObject(id = "m", mediaURL = "file:///author/sandbox/missing.jpg"))
        compose.setContent { SceneCanvas(items = items) }
        compose.onAllNodesWithTag(SCENE_MEDIA_TAG).assertCountEquals(0)
    }

    @Test
    fun `la signature d un media change avec son rognage`() {
        val a = plan(StoryMediaObject(id = "m")).single().signature
        val b = plan(StoryMediaObject(id = "m", crop = StoryMediaCrop(0.0, 0.0, 0.5, 0.5))).single().signature
        assertThat(a).isNotEqualTo(b)
    }
}
