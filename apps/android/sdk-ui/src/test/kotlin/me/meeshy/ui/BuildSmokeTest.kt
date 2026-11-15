package me.meeshy.ui

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class BuildSmokeTest {

    @Test
    fun `robolectric fournit un contexte applicatif pour les tests de sdk-ui`() {
        val context: Context = ApplicationProvider.getApplicationContext()

        assertThat(context.packageName).isNotEmpty()
    }

    @Test
    fun `mockk turbine et coroutines-test sont utilisables dans sdk-ui`() = runTest {
        val source = mockk<Runnable>(relaxed = true)
        every { source.run() } returns Unit

        flowOf(1, 2).test {
            assertThat(awaitItem()).isEqualTo(1)
            assertThat(awaitItem()).isEqualTo(2)
            awaitComplete()
        }
    }
}
