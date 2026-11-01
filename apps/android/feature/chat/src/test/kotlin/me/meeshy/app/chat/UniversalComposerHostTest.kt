package me.meeshy.app.chat

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.composer.ComposerConfiguration
import me.meeshy.ui.component.composer.ComposerStickerSheet
import me.meeshy.ui.component.composer.LocalComposerStickerSheet
import me.meeshy.ui.component.composer.UniversalComposerSpec
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** Le composeur universel sous ses deux réglages (#14265) : ce qui apparaît, ce qui n'apparaît pas, ce qui part. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class UniversalComposerHostTest {

    @get:Rule
    val compose = createComposeRule()

    private fun string(id: Int): String = RuntimeEnvironment.getApplication().getString(id)

    private fun spec(
        configuration: ComposerConfiguration,
        draft: String = "",
        attaches: Boolean = true,
        onSend: () -> Unit = {},
    ) = UniversalComposerSpec(
        configuration = configuration,
        draft = draft,
        placeholder = "Commenter...",
        canSend = draft.isNotBlank(),
        onDraftChange = {},
        onSend = onSend,
        onAttachUris = if (attaches) ({ _ -> }) else null,
        onAttachFile = if (attaches) ({ _, _, _ -> }) else null,
    )

    private fun show(spec: UniversalComposerSpec) {
        compose.setContent { MeeshyTheme(darkTheme = false) { UniversalComposerHost(spec, Modifier) } }
    }

    private fun showWithStickers(spec: UniversalComposerSpec, sheet: ComposerStickerSheet) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                CompositionLocalProvider(LocalComposerStickerSheet provides sheet) { UniversalComposerHost(spec, Modifier) }
            }
        }
    }

    @Test fun `#14320 en commentaire, la porte sticker ouvre la feuille, et le sticker choisi rejoint les pièces en PNG`() {
        val attached = mutableListOf<String?>()
        val base = spec(ComposerConfiguration.COMMENT)
        var opened = 0
        showWithStickers(base.copy(onAttachFile = { file, _, mime -> attached += mime; file.delete() })) { onPick, _ ->
            opened += 1
            androidx.compose.runtime.LaunchedEffect(Unit) { onPick("🔥") }
        }
        compose.onNodeWithContentDescription(string(R.string.composer_attach_sticker)).performClick()
        compose.waitUntil(timeoutMillis = 5_000) { attached.isNotEmpty() }
        assertThat(opened).isAtLeast(1)
        assertThat(attached).containsExactly("image/png")
    }

    @Test fun `#14320 sans feuille de stickers fournie, ou sans pièces reçues, aucune porte sticker`() {
        show(spec(ComposerConfiguration.COMMENT))
        compose.onNodeWithContentDescription(string(R.string.composer_attach_sticker)).assertDoesNotExist()
    }

    @Test fun `#14320 un hôte qui ne reçoit pas de pièce n'offre pas le sticker`() {
        showWithStickers(spec(ComposerConfiguration.COMMENT, attaches = false)) { _, _ -> }
        compose.onNodeWithContentDescription(string(R.string.composer_attach_sticker)).assertDoesNotExist()
    }

    @Test fun `en commentaire, le champ dit Commenter, la photothèque, la caméra et le vocal sont là`() {
        show(spec(ComposerConfiguration.COMMENT))
        compose.onNodeWithText("Commenter...").assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.composer_attach_photo)).assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.composer_attach_camera)).assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.chat_record_voice)).assertIsDisplayed()
    }

    @Test fun `en commentaire, ni éphémère, ni flou, ni vue unique, ni effets, ni langue`() {
        show(spec(ComposerConfiguration.COMMENT))
        compose.onNodeWithContentDescription(string(R.string.chat_ephemeral_activate)).assertDoesNotExist()
        compose.onNodeWithContentDescription(string(R.string.chat_effect_blurred)).assertDoesNotExist()
        compose.onNodeWithContentDescription(string(R.string.chat_effect_view_once)).assertDoesNotExist()
        compose.onNodeWithContentDescription(string(R.string.chat_effects_open)).assertDoesNotExist()
    }

    @Test fun `un hôte qui ne sait pas joindre n'offre ni photothèque, ni caméra, ni vocal`() {
        show(spec(ComposerConfiguration.COMMENT, attaches = false))
        compose.onNode(hasSetTextAction()).assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.composer_attach_photo)).assertDoesNotExist()
        compose.onNodeWithContentDescription(string(R.string.composer_attach_camera)).assertDoesNotExist()
        compose.onNodeWithContentDescription(string(R.string.chat_record_voice)).assertDoesNotExist()
    }

    @Test fun `en conversation, toutes les bascules restent`() {
        show(spec(ComposerConfiguration.CONVERSATION))
        compose.onNodeWithContentDescription(string(R.string.chat_ephemeral_activate)).assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.chat_effect_blurred)).assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.chat_effect_view_once)).assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.chat_effects_open)).assertIsDisplayed()
    }

    @Test fun `un commentaire écrit part par l'envoi`() {
        var sent = 0
        show(spec(ComposerConfiguration.COMMENT, draft = "Bravo", onSend = { sent += 1 }))
        compose.onNodeWithContentDescription(string(R.string.chat_send)).performClick()
        assertThat(sent).isEqualTo(1)
    }
}
