package me.meeshy.app.conversations

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.sdk.model.reading.mode.ReadingModeChoice
import me.meeshy.sdk.model.reading.mode.ReadingModeMenuModel
import me.meeshy.sdk.model.reading.mode.ReadingModePreferenceScope
import me.meeshy.sdk.reading.SharedPreferencesReadingModeStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.ui.component.reading.readingModeEntryTestTag
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp")
class ConversationReadingModeSubmenuTest {

    @get:Rule
    val compose = createComposeRule()

    private val viewer = MeeshyUser(id = "me", username = "me", role = "USER", isAnonymous = false)

    private fun store() = SharedPreferencesReadingModeStore(ApplicationProvider.getApplicationContext<Context>())
        .also { it.clearAll() }

    private fun service(
        store: SharedPreferencesReadingModeStore,
        user: MeeshyUser? = viewer,
    ) = ConversationReadingModes(
        store,
        mockk<SessionRepository> { every { currentUser } returns MutableStateFlow(user) },
    )

    private fun conversation(type: String = "group") =
        ApiConversation(id = "c1", identifier = "c1", type = type, title = "Team", currentUserRole = "member")

    @Test
    fun `without a stored choice the submenu checks automatic`() {
        val entries = service(store()).entries(conversation())!!
        assertThat(entries.filter { it.isSelected }.map { it.choice }).containsExactly(ReadingModeChoice.Auto)
    }

    @Test
    fun `choosing a mode in the list is the same state the thread chip reads`() {
        val store = store()
        val service = service(store)
        service.choose(conversation(), ReadingModeChoice.Mode(ConversationReadingMode.BUBBLES))

        assertThat(store.mode("c1", ReadingModePreferenceScope.Registered("me"))).isEqualTo(ConversationReadingMode.BUBBLES)
        assertThat(service.entries(conversation())!!.first { it.isSelected }.choice)
            .isEqualTo(ReadingModeChoice.Mode(ConversationReadingMode.BUBBLES))
    }

    @Test
    fun `choosing automatic clears the sticky choice`() {
        val store = store()
        val service = service(store)
        service.choose(conversation(), ReadingModeChoice.Mode(ConversationReadingMode.FOCAL))
        service.choose(conversation(), ReadingModeChoice.Auto)

        assertThat(store.mode("c1", ReadingModePreferenceScope.Registered("me"))).isNull()
    }

    @Test
    fun `no signed in reader means no submenu`() {
        assertThat(service(store(), user = null).entries(conversation())).isNull()
    }

    @Test
    fun `a direct conversation greys the river with its reason`() {
        val river = service(store()).entries(conversation(type = "direct"))!!
            .first { it.choice == ReadingModeChoice.Mode(ConversationReadingMode.RIVER) }
        assertThat(river.isDisabled).isTrue()
    }

    @Test
    fun `the panel lists the six entries and reports the tapped choice`() {
        val chosen = mutableListOf<ReadingModeChoice>()
        val entries = ReadingModeMenuModel.forConversation("direct", 2, false, true, true, preference = null)
        compose.setContent {
            MeeshyTheme {
                ReadingModePanel(entries = entries, accent = MeeshyPalette.Indigo500, onBack = {}, onChoose = { chosen += it })
            }
        }
        entries.forEach { compose.onNodeWithTag(readingModeEntryTestTag(it.choice)).assertIsDisplayed() }
        compose.onNodeWithTag(readingModeEntryTestTag(ReadingModeChoice.Mode(ConversationReadingMode.RIVER))).assertIsNotEnabled()
        compose.onNodeWithTag(readingModeEntryTestTag(ReadingModeChoice.Mode(ConversationReadingMode.SCRIPT))).performClick()
        assertThat(chosen).containsExactly(ReadingModeChoice.Mode(ConversationReadingMode.SCRIPT))
    }
}
