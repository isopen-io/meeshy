package me.meeshy.ui.story.canvas

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AdjustmentKind
import me.meeshy.sdk.model.ImageAdjustments
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.ui.component.imageedit.ColorMatrixFallback
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SceneLookBakerRobolectricTest {
    private var renders = 0

    private fun baker() = SceneLookBaker(
        renderer = { bitmap, recipe ->
            renders++
            ColorMatrixFallback.render(bitmap, recipe)
        },
    )

    private fun bitmap(): Bitmap =
        Bitmap.createBitmap(6, 6, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.rgb(90, 140, 200)) }

    private fun contrast(v: Float) =
        SceneLookRecipe.forStory(null, 1f, ImageAdjustments().with(AdjustmentKind.CONTRAST, v))

    @Test
    fun `aucune cuisson quand le look est neutre`() {
        val baker = baker()
        val image = bitmap()
        val request = SceneLookBakeRequest(image, "bg", SceneLookRecipe.NEUTRAL)
        assertThat(baker.ready(request)).isSameInstanceAs(image)
        assertThat(baker.bake(request)).isSameInstanceAs(image)
        assertThat(renders).isEqualTo(0)
    }

    @Test
    fun `le cache par valeurs sert un curseur revenu sans nouveau rendu`() {
        val baker = baker()
        val image = bitmap()
        val a = SceneLookBakeRequest(image, "bg", contrast(1.2f))
        val b = SceneLookBakeRequest(image, "bg", contrast(1.4f))
        assertThat(baker.ready(a)).isNull()
        val first = baker.bake(a)
        baker.bake(b)
        assertThat(renders).isEqualTo(2)
        assertThat(baker.ready(a)).isSameInstanceAs(first)
        assertThat(baker.bake(a)).isSameInstanceAs(first)
        assertThat(renders).isEqualTo(2)
    }

    @Test
    fun `le filtre et les reglages se cuisent en un seul rendu`() {
        val baker = baker()
        val recipe = SceneLookRecipe.forStory(StoryFilter.VINTAGE, 1f, ImageAdjustments().with(AdjustmentKind.CONTRAST, 1.3f))
        baker.bake(SceneLookBakeRequest(bitmap(), "bg", recipe))
        assertThat(renders).isEqualTo(1)
    }

    @Test
    fun `le dernier cran gagne et le bitmap affiche reste jusqu au suivant`() = runTest {
        val executor = Executors.newSingleThreadExecutor()
        val started = CountDownLatch(1)
        val release = CountDownLatch(1)
        val baker = SceneLookBaker(
            renderer = { bitmap, recipe ->
                renders++
                if (renders == 1) {
                    started.countDown()
                    release.await(5, TimeUnit.SECONDS)
                }
                ColorMatrixFallback.render(bitmap, recipe)
            },
        )
        val live = SceneLiveLook(this, executor.asCoroutineDispatcher(), baker)
        val image = bitmap()
        val delivered = mutableListOf<Bitmap>()
        live.bake(SceneLookBakeRequest(image, "bg", contrast(1.1f))) { delivered += it }
        testScheduler.runCurrent()
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue()
        live.bake(SceneLookBakeRequest(image, "bg", contrast(1.2f))) { delivered += it }
        live.bake(SceneLookBakeRequest(image, "bg", contrast(1.3f))) { delivered += it }
        release.countDown()
        val deadline = System.currentTimeMillis() + 5_000
        while (live.isBaking && System.currentTimeMillis() < deadline) {
            testScheduler.advanceUntilIdle()
            Thread.sleep(5)
        }
        executor.shutdown()
        assertThat(renders).isEqualTo(2)
        assertThat(delivered).hasSize(2)
        val last = baker.ready(SceneLookBakeRequest(image, "bg", contrast(1.3f)))
        assertThat(delivered.last()).isSameInstanceAs(last)
    }

    @Test
    fun `une source remplacee ne recoit jamais la cuisson de l ancienne`() = runTest {
        val executor = Executors.newSingleThreadExecutor()
        val live = SceneLiveLook(this, executor.asCoroutineDispatcher(), baker())
        val delivered = mutableListOf<Bitmap>()
        live.bake(SceneLookBakeRequest(bitmap(), "bg", contrast(1.5f))) { delivered += it }
        live.supersede()
        val deadline = System.currentTimeMillis() + 5_000
        while (live.isBaking && System.currentTimeMillis() < deadline) {
            testScheduler.advanceUntilIdle()
            Thread.sleep(5)
        }
        executor.shutdown()
        assertThat(delivered).isEmpty()
    }

    @Test
    fun `un look deja cuit se pose tout de suite sans boucle`() = runTest {
        val baker = baker()
        val image = bitmap()
        val request = SceneLookBakeRequest(image, "bg", contrast(1.5f))
        val baked = baker.bake(request)
        val live = SceneLiveLook(this, StandardTestDispatcher(testScheduler), baker)
        var delivered: Bitmap? = null
        live.bake(request) { delivered = it }
        assertThat(delivered).isSameInstanceAs(baked)
        assertThat(live.isBaking).isFalse()
    }
}
