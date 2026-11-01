package me.meeshy.app.stories

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import coil.Coil
import coil.ImageLoader
import coil.decode.DataSource
import coil.intercept.Interceptor
import coil.request.ImageResult
import coil.request.SuccessResult
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.story.sceneItems
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.math.abs

/**
 * #14199 — recette S8 : le post « Hors ligne 13416 » est une image 3:4 posée AJUSTÉE (`videoFitMode: "fit"`) sur sa scène, son
 * texte blanc gravé près du bord gauche. Le player la peignait REMPLIE : agrandie à la hauteur du 9:16, rognée d'un huitième de
 * chaque côté, et le « H » disparaissait (« lors ligne »), dans la carte du fil comme dans la fiche. iOS l'ajuste
 * (`.resizeAspect`) : l'image tient entière, centrée, et le cadrage de la carte montre exactement sa bande.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class StorySceneFittedBackgroundTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        Coil.setImageLoader(ImageLoader.Builder(compose.activity).components { add(ThreeByFourPicture) }.build())
    }

    @After
    fun tearDown() {
        Coil.reset()
        Dispatchers.resetMain()
    }

    /** Une image 3:4 verte, son dixième GAUCHE rouge (là où le « H » est gravé), son dixième HAUT bleu. */
    private object ThreeByFourPicture : Interceptor {
        override suspend fun intercept(chain: Interceptor.Chain): ImageResult {
            val bitmap = Bitmap.createBitmap(PICTURE_W, PICTURE_H, Bitmap.Config.ARGB_8888)
            for (x in 0 until PICTURE_W) {
                for (y in 0 until PICTURE_H) {
                    val color = when {
                        x < PICTURE_W / 10 -> Color.Red
                        y < PICTURE_H / 10 -> Color.Blue
                        else -> Color.Green
                    }
                    bitmap.setPixel(x, y, color.toArgb())
                }
            }
            return SuccessResult(BitmapDrawable(chain.request.context.resources, bitmap), chain.request, DataSource.MEMORY)
        }
    }

    /** La scène servie du post de recette, à l'identique : une image de fond 3:4, ajustée, sans autre calque. */
    private fun fittedPicturePost(fitMode: String): ApiPost = MeeshyApi.json.decodeFromString(
        ApiPost.serializer(),
        """{ "id": "p1", "type": "POST", "content": "",
             "media": [{ "id": "6ae0f5853ee363fd25a2d2b9", "fileUrl": "https://cdn.meeshy.me/hors-ligne.webp", "mimeType": "image/webp" }],
             "storyEffects": { "v": 3, "scenes": [{ "id": "page-1", "objects": [{
                 "id": "background", "kind": "media", "anchor": { "t": "free", "x": 0.5, "y": 0.5 }, "plane": "content", "z": 0,
                 "transform": { "scale": 1, "rotation": 0, "opacity": 1 },
                 "payload": { "postMediaId": "6ae0f5853ee363fd25a2d2b9", "mediaURL": "https://cdn.meeshy.me/hors-ligne.webp",
                              "mediaType": "image", "isBackground": true, "transform": { "videoFitMode": "$fitMode" }, "aspectRatio": 0.75 }
             }] }] } }""",
    )

    private fun slideOf(post: ApiPost): StorySlideView =
        StorySlideProjector(null).project(requireNotNull(post.sceneItems()).items.single(), "6366F1", NoContentPreferences)

    private fun paint(post: ApiPost): ImageBitmap {
        val slide = slideOf(post)
        compose.setContent {
            Box(Modifier.size(width = SCENE_W.dp, height = SCENE_H.dp)) {
                StorySceneBackground(slide = slide, playing = false, muted = true)
            }
        }
        compose.waitForIdle()
        val content = compose.activity.findViewById<android.view.ViewGroup>(android.R.id.content).getChildAt(0) as ComposeView
        val bitmap = Bitmap.createBitmap(content.width, content.height, Bitmap.Config.ARGB_8888)
        content.draw(Canvas(bitmap))
        return bitmap.asImageBitmap()
    }

    @Test
    fun `the served scene of the post projects its picture fitted, and a filled one filled`() {
        assertThat(slideOf(fittedPicturePost("fit")).backgroundFits).isTrue()
        assertThat(slideOf(fittedPicturePost("fill")).backgroundFits).isFalse()
    }

    @Test
    fun `a picture posed fitted keeps its left edge, where the text begins, inside the scene`() {
        val pixels = paint(fittedPicturePost("fit")).toPixelMap()

        assertThat(pixels[3, SCENE_H / 2].name()).isEqualTo("red")
    }

    @Test
    fun `a picture posed fitted shows its top edge at the top of its band, centred in the scene`() {
        val pixels = paint(fittedPicturePost("fit")).toPixelMap()
        val bandTop = (SCENE_H - SCENE_W * PICTURE_H / PICTURE_W) / 2

        assertThat(pixels[SCENE_W / 2, bandTop + 4].name()).isEqualTo("blue")
    }

    @Test
    fun `a picture posed filled still covers the scene, its left edge cut`() {
        val pixels = paint(fittedPicturePost("fill")).toPixelMap()

        assertThat(pixels[3, SCENE_H / 2].name()).isEqualTo("green")
    }

    private fun Color.name(): String =
        listOf("red" to Color.Red, "green" to Color.Green, "blue" to Color.Blue).firstOrNull { isNear(it.second) }?.first ?: toString()

    private fun Color.isNear(other: Color): Boolean =
        alpha > 0.9f && abs(red - other.red) < 0.1f && abs(green - other.green) < 0.1f && abs(blue - other.blue) < 0.1f

    private companion object {
        const val PICTURE_W = 60
        const val PICTURE_H = 80
        const val SCENE_W = 90
        const val SCENE_H = 160
    }
}
