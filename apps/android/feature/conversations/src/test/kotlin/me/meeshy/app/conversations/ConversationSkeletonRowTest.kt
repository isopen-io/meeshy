package me.meeshy.app.conversations

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onChildren
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationSkeletonRowTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `a skeleton row is as tall as a real row`() {
        compose.setContent { MeeshyTheme { ConversationSkeletonRow(index = 0) } }

        compose.onNodeWithTag(ConversationSkeletonMetrics.TEST_TAG).assertHeightIsEqualTo(84.dp)
    }

    @Test
    fun `a skeleton row exposes nothing to the accessibility tree`() {
        compose.setContent { MeeshyTheme { ConversationSkeletonRow(index = 0) } }

        compose.onNodeWithTag(ConversationSkeletonMetrics.TEST_TAG, useUnmergedTree = true)
            .onChildren()
            .assertCountEqualsZero()
    }

    @Test
    fun `rows appear 40 ms apart by index`() {
        assertThat(ConversationSkeletonMetrics.appearDelayMillis(0)).isEqualTo(0)
        assertThat(ConversationSkeletonMetrics.appearDelayMillis(1)).isEqualTo(40)
        assertThat(ConversationSkeletonMetrics.appearDelayMillis(5)).isEqualTo(200)
    }

    @Test
    fun `the skeleton shows six rows with a 44 dp avatar`() {
        assertThat(ConversationSkeletonMetrics.ROW_COUNT).isEqualTo(6)
        assertThat(ConversationSkeletonMetrics.avatarSize).isEqualTo(44.dp)
    }

    private fun androidx.compose.ui.test.SemanticsNodeInteractionCollection.assertCountEqualsZero() =
        assertCountEquals(0)
}
