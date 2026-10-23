package me.meeshy.app.calls

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.drawable.BitmapDrawable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import android.view.View
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import coil.Coil
import coil.ImageLoader
import coil.decode.DataSource
import coil.intercept.Interceptor
import coil.request.ImageResult
import coil.request.SuccessResult
import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.appearance.AvatarRingDesign
import me.meeshy.sdk.model.appearance.AvatarRingStroke
import me.meeshy.sdk.model.appearance.RingStrokeStyle
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.OutgoingRingingLabel
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * L'écran d'appel AUDIO rendu en vrai (#12335), à chacune de ses phases : la photo du
 * correspondant remplit le disque, son contour équipé l'entoure, sa bannière floutée couvre le
 * fond. Les images sont servies par un chargeur Coil de test (une photo BLEUE, une bannière
 * ROUGE) pour que les pixels disent d'où ils viennent ; les captures sont écrites sous
 * `build/call-peer-visual/` pour la recette visuelle.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CallPeerVisualRenderTest {
    @get:Rule val rule = createComposeRule()

    private val context: Context = ApplicationProvider.getApplicationContext()

    private val ring = AvatarRingDesign(
        key = "aurore",
        stroke = AvatarRingStroke(style = RingStrokeStyle.SOLID, width = 0.08, colors = listOf("#FF00AA")),
    )

    private val peer = CallPeerVisual(
        avatarUrl = "https://staging.meeshy.me/u/bob-avatar.jpg",
        bannerUrl = "https://staging.meeshy.me/u/bob-banner.jpg",
        ring = ring,
    )

    private val config = CallConfig(peerId = "u1", peerName = "Bob", isVideo = false, isOutgoing = true)

    @Before
    fun serveFakeImages() {
        Coil.setImageLoader(
            ImageLoader.Builder(context)
                .components { add(FakeImages(context)) }
                .build(),
        )
    }

    @After
    fun resetImages() {
        Coil.reset()
    }

    private fun ui(state: CallState, elapsed: Long = 0) =
        CallPresenter.present(state, config, CallMedia(), elapsedSeconds = elapsed, mediaEstablished = elapsed > 0)

    @Test
    fun `outgoing ringing shows the photo inside the equipped ring over the blurred banner`() {
        renderPhase("outgoing") {
            CallOutgoingRingingBody(ui(CallState.Ringing(true)), OutgoingRingingLabel.Placing, peer, true, {})
        }
    }

    @Test
    fun `an incoming call shows the photo inside the equipped ring over the blurred banner`() {
        renderPhase("incoming") {
            IncomingCallScreen(
                state = CallPresenter.present(CallState.Ringing(false), config.copy(isOutgoing = false), CallMedia()),
                accent = CallPalette.Brand,
                peer = peer,
                reduceMotion = true,
                onAccept = {},
                onDecline = {},
            )
        }
    }

    @Test
    fun `the connected audio call shows the photo inside the equipped ring over the blurred banner`() {
        renderPhase("connected") { CallAudioStage(ui(CallState.Connected, elapsed = 65), peer) }
    }

    @Test
    fun `reconnecting keeps the photo, the ring and the banner`() {
        renderPhase("reconnecting") { CallAudioStage(ui(CallState.Reconnecting(1), elapsed = 65), peer) }
    }

    @Test
    fun `without a banner the blurred photo stands in for the backdrop`() {
        val noBanner = peer.copy(bannerUrl = null)
        assertThat(noBanner.backdropUrl).isEqualTo(noBanner.avatarUrl)
        val shot = capture("no-banner", noBanner) { CallAudioStage(ui(CallState.Connected, elapsed = 65), noBanner) }
        val corner = shot.getPixel(shot.width / 20, shot.height - shot.height / 20)
        assertThat(blue(corner)).isGreaterThan(red(corner))
    }

    private fun renderPhase(name: String, content: @Composable () -> Unit) {
        val shot = capture(name, peer, content)
        val corner = shot.getPixel(shot.width / 20, shot.height - shot.height / 20)
        assertThat(red(corner)).isGreaterThan(blue(corner))
        assertThat(countPixels(shot) { isRingPink(it) }).isGreaterThan(RING_PIXELS_MIN)
        assertThat(countPixels(shot) { isAvatarBlue(it) }).isGreaterThan(AVATAR_PIXELS_MIN)
    }

    private fun capture(name: String, visual: CallPeerVisual, content: @Composable () -> Unit): Bitmap {
        var host: View? = null
        rule.setContent {
            host = LocalView.current
            MeeshyTheme(darkTheme = true) {
                Box(Modifier.size(411.dp, 891.dp).testTag(SCREEN), contentAlignment = Alignment.Center) {
                    CallBackdrop(imageUrl = visual.backdropUrl)
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
                }
            }
        }
        rule.waitForIdle()
        val bitmap = rule.runOnIdle {
            val view = checkNotNull(host)
            Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888).also { view.draw(Canvas(it)) }
        }
        val dir = File("build/call-peer-visual").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        return bitmap
    }

    private fun countPixels(bitmap: Bitmap, predicate: (Int) -> Boolean): Int {
        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        return pixels.count(predicate)
    }

    private fun isRingPink(color: Int) = red(color) > 200 && green(color) < 60 && blue(color) in 120..220
    private fun isAvatarBlue(color: Int) = blue(color) > 200 && red(color) < 60 && green(color) < 60

    private fun red(color: Int) = (color shr 16) and 0xFF
    private fun green(color: Int) = (color shr 8) and 0xFF
    private fun blue(color: Int) = color and 0xFF

    /** Une photo bleue pour toute adresse « avatar », une bannière rouge pour toute adresse « banner ». */
    private class FakeImages(private val context: Context) : Interceptor {
        override suspend fun intercept(chain: Interceptor.Chain): ImageResult {
            val url = chain.request.data.toString()
            val color = if ("banner" in url) android.graphics.Color.rgb(230, 30, 20) else android.graphics.Color.rgb(10, 20, 240)
            val bitmap = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888)
            Canvas(bitmap).drawRect(0f, 0f, 64f, 64f, Paint().apply { this.color = color })
            return SuccessResult(BitmapDrawable(context.resources, bitmap), chain.request, DataSource.MEMORY)
        }
    }

    private companion object {
        const val SCREEN = "call-screen"
        const val RING_PIXELS_MIN = 500
        const val AVATAR_PIXELS_MIN = 5_000
    }
}
