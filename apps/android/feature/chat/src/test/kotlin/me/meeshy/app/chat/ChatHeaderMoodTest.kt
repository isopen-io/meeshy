package me.meeshy.app.chat

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.profile.PeerMood
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import androidx.compose.runtime.CompositionLocalProvider
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La boule de mood du pair d'une directe, sur l'avatar de l'en-tête (#13987) : la toucher ouvre la
 * page plein écran de SON humeur — sans bulle ni pop-up de réponse, comme iOS. TalkBack l'atteint par
 * une action nommée, puisque l'avatar est un seul élément.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatHeaderMoodTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(mood: PeerMood?, onOpenMood: (PeerMood) -> Unit) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides true) {
                    ChatHeaderAvatar(
                        name = "Ana",
                        door = ChatHeaderAvatarDoor.PROFILE,
                        accentColor = MeeshyPalette.Indigo500,
                        imageUrl = null,
                        presence = null,
                        isUser = true,
                        onOpenProfile = {},
                        onOpenDetails = {},
                        onToggle = {},
                        mood = mood,
                        onOpenMood = onOpenMood,
                    )
                }
            }
        }
    }

    private fun avatarActionLabels(): List<String> =
        compose.onNodeWithContentDescription("View Ana's profile").fetchSemanticsNode()
            .config.getOrNull(SemanticsActions.CustomActions).orEmpty().map { it.label }

    @Test
    fun `the peer mood opens its own page, never a reply popup`() {
        val mood = PeerMood(statusId = "s1", emoji = "🔥")
        var opened: PeerMood? = null
        show(mood) { opened = it }

        val action = compose.onNodeWithContentDescription("View Ana's profile").fetchSemanticsNode()
            .config[SemanticsActions.CustomActions].first { it.label == "View Ana's mood" }
        compose.runOnIdle { action.action() }

        assertThat(opened).isEqualTo(mood)
    }

    @Test
    fun `without a live mood the avatar offers no mood action`() {
        show(mood = null) {}

        assertThat(avatarActionLabels()).doesNotContain("View Ana's mood")
        assertThat(
            compose.onNodeWithContentDescription("View Ana's profile").fetchSemanticsNode()
                .config.getOrNull(SemanticsProperties.ContentDescription),
        ).containsExactly("View Ana's profile")
    }
}
