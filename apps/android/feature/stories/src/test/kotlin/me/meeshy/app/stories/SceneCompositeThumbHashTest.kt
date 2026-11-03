package me.meeshy.app.stories

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import java.util.Base64
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.media.ThumbHash
import me.meeshy.sdk.net.api.CreateStoryRequest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SceneCompositeThumbHashTest {

    private fun composite(width: Int = 74, height: Int = 132) =
        Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.rgb(200, 40, 40)) }

    private fun request(effects: StoryEffects?) = CreateStoryRequest(type = "STORY", storyEffects = effects)

    @Test
    fun `a composite yields a compact decodable hash`() = runTest {
        val hash = SceneCompositeThumbHash.of(composite(), StandardTestDispatcher(testScheduler))
        assertThat(hash).isNotNull()
        val bytes = Base64.getDecoder().decode(hash)
        assertThat(bytes.size).isAtMost(40)
        assertThat(ThumbHash.decode(bytes).width).isGreaterThan(0)
    }

    @Test
    fun `a large composite is reduced to the legal plan instead of refused`() {
        assertThat(SceneCompositeThumbHash.encode(composite(540, 960))).isNotNull()
    }

    @Test
    fun `a recycled composite yields no hash and never throws`() = runTest {
        val dead = composite().also { it.recycle() }
        assertThat(SceneCompositeThumbHash.of(dead, StandardTestDispatcher(testScheduler))).isNull()
    }

    @Test
    fun `attach writes the hash on a scene that has none`() {
        val out = SceneCompositeThumbHash.attach(request(StoryEffects()), "abc")
        assertThat(out.storyEffects?.thumbHash).isEqualTo("abc")
    }

    @Test
    fun `attach keeps the hash a scene already carries`() {
        val out = SceneCompositeThumbHash.attach(request(StoryEffects(thumbHash = "mine")), "abc")
        assertThat(out.storyEffects?.thumbHash).isEqualTo("mine")
    }

    @Test
    fun `attach leaves a request without scene or without hash untouched`() {
        val bare = request(null)
        assertThat(SceneCompositeThumbHash.attach(bare, "abc")).isSameInstanceAs(bare)
        val scene = request(StoryEffects())
        assertThat(SceneCompositeThumbHash.attach(scene, null)).isSameInstanceAs(scene)
    }
}
