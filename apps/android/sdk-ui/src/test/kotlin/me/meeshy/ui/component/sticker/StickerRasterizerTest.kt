package me.meeshy.ui.component.sticker

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.ui.sticker.template.StickerTemplateMetrics
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StickerRasterizerTest {

    private val metrics = StickerTemplateMetrics.preview(104f)

    @Test
    fun `un cadre a mots donne un PNG non vide`() = runTest {
        val png = StickerRasterizer.png("text.ribbon", mapOf("text" to "Salut"), metrics, 2f, dispatcher = StandardTestDispatcher(testScheduler))
        assertThat(png).isNotNull()
        assertThat(png!!.size).isGreaterThan(0)
    }

    @Test
    fun `un gabarit inconnu n'envoie rien`() = runTest {
        assertThat(StickerRasterizer.png("text.future", emptyMap(), metrics, 2f, dispatcher = StandardTestDispatcher(testScheduler))).isNull()
    }
}
