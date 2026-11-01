package me.meeshy.app.feed

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.mention.MentionAutocompleteState
import me.meeshy.sdk.model.composer.ComposerCapability
import me.meeshy.sdk.model.composer.ComposerConfiguration
import me.meeshy.ui.component.composer.LocalUniversalComposer
import me.meeshy.ui.component.composer.UniversalComposer
import me.meeshy.ui.component.composer.UniversalComposerSpec
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #14320 — la réponse à une humeur passe par le composeur universel, en texte seul : aucune porte de pièce. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MoodReplyComposerTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `la réponse monte le composeur universel en réglage commentaire, sans pièce, et l'envoi suit l'état`() {
        val mounted = mutableListOf<UniversalComposerSpec>()
        val composer: UniversalComposer = { spec, _ -> mounted += spec }
        var sent = 0
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalUniversalComposer provides composer) {
                    MoodReplyComposer(
                        text = "Courage !",
                        authorName = "Léa",
                        isSending = false,
                        canSend = true,
                        mention = MentionAutocompleteState(),
                        onChange = {},
                        onMentionSelected = {},
                        onSend = { sent += 1 },
                    )
                }
            }
        }
        compose.waitForIdle()

        val spec = mounted.last()
        assertThat(spec.configuration).isEqualTo(ComposerConfiguration.COMMENT)
        assertThat(spec.draft).isEqualTo("Courage !")
        assertThat(spec.canSend).isTrue()
        ComposerCapability.ATTACHMENTS.forEach { assertThat(spec.effectiveConfiguration.offers(it)).isFalse() }
        spec.onSend()
        assertThat(sent).isEqualTo(1)
    }
}
