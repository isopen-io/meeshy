package me.meeshy.app.chat

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.onRoot
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.composer.ComposerConfiguration
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.ui.component.composer.ComposerStickerPick
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

    @Test fun `#14320 #14334 en commentaire, la porte sticker ouvre la feuille, et le sticker choisi rejoint les pièces en image`() {
        val attached = mutableListOf<String?>()
        val base = spec(ComposerConfiguration.COMMENT)
        var opened = 0
        val png = java.io.File.createTempFile("sticker", ".png")
        val pick = ComposerStickerPick(png, "image/png", MessageSticker(emoji = "🔥"), 512, 512)
        showWithStickers(base.copy(onAttachFile = { file, _, mime -> attached += mime; file.delete() })) { onPick, _ ->
            opened += 1
            androidx.compose.runtime.LaunchedEffect(Unit) { onPick(pick) }
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

    @Test fun `#14385 en commentaire qui applique les effets, le flou et les effets sont là, ni éphémère ni vue unique`() {
        val toggled = mutableListOf<Long>()
        show(spec(ComposerConfiguration.COMMENT).served().copy(onToggleEffect = { toggled += it }))
        compose.onNodeWithContentDescription(string(R.string.chat_effect_blurred)).assertIsDisplayed().performClick()
        compose.onNodeWithContentDescription(string(R.string.chat_effects_open)).assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.chat_ephemeral_activate)).assertDoesNotExist()
        compose.onNodeWithContentDescription(string(R.string.chat_effect_view_once)).assertDoesNotExist()
        assertThat(toggled).isNotEmpty()
    }

    @Test fun `#14387 le lieu en attente se pose en pastille au-dessus de la saisie et se retire`() {
        var removed = 0
        val place = me.meeshy.sdk.model.SharedPlace(latitude = 48.85, longitude = 2.35, name = "Café de Flore")
        show(spec(ComposerConfiguration.COMMENT).served().copy(onPickPlace = {}, pendingPlace = place, onRemovePlace = { removed += 1 }))
        compose.onNodeWithText("Café de Flore").assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.chat_search_clear)).performClick()
        assertThat(removed).isEqualTo(1)
    }

    @Test fun `en commentaire qui n'applique pas d'effet, ni éphémère, ni flou, ni vue unique, ni effets`() {
        show(spec(ComposerConfiguration.COMMENT).served())
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
        show(spec(ComposerConfiguration.CONVERSATION).copy(onToggleEffect = {}))
        compose.onNodeWithContentDescription(string(R.string.chat_ephemeral_activate)).assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.chat_effect_blurred)).assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.chat_effect_view_once)).assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.chat_effects_open)).assertIsDisplayed()
    }

    private fun UniversalComposerSpec.served(picked: MutableList<String> = mutableListOf(), quick: MutableList<String> = mutableListOf()) =
        copy(onPickLanguage = { picked += it }, onQuickEmoji = { quick += it }, foldable = true, languageCode = "es")

    @Test fun `#14384 en commentaire servi, la pastille de langue, les emojis rapides et le chevron sont là, comme pour un message`() {
        show(spec(ComposerConfiguration.COMMENT).served())
        compose.onNodeWithContentDescription(string(R.string.chat_composer_language)).assertIsDisplayed()
        compose.onNodeWithContentDescription(string(R.string.composer_fold)).assertIsDisplayed()
        compose.onNodeWithText("❤️").assertIsDisplayed()
    }

    @Test fun `#14384 sans choix de langue ni envoi d'emoji servis, ni pastille ni emojis rapides`() {
        show(spec(ComposerConfiguration.COMMENT))
        compose.onNodeWithContentDescription(string(R.string.chat_composer_language)).assertDoesNotExist()
        compose.onNodeWithText("❤️").assertDoesNotExist()
        compose.onNodeWithContentDescription(string(R.string.composer_fold)).assertDoesNotExist()
    }

    @Test fun `#14384 un emoji rapide touché part par l'hôte`() {
        val quick = mutableListOf<String>()
        show(spec(ComposerConfiguration.COMMENT).served(quick = quick))
        compose.waitForIdle()
        Thread.sleep(QUICK_EMOJI_ARRIVAL_WAIT_MS)
        compose.onNodeWithText("❤️").performClick()
        assertThat(quick).containsExactly("❤️")
    }

    @Test fun `#14384 photothèque, caméra et chevron tiennent l'angle droit de la rangée d'outils, comme la barre de message`() {
        show(spec(ComposerConfiguration.COMMENT).served())
        val root = compose.onRoot().getBoundsInRoot()
        val camera = compose.onNodeWithContentDescription(string(R.string.composer_attach_camera)).getBoundsInRoot()
        val fold = compose.onNodeWithContentDescription(string(R.string.composer_fold)).getBoundsInRoot()
        val pill = compose.onNodeWithContentDescription(string(R.string.chat_composer_language)).getBoundsInRoot()
        assertThat(fold.right.value).isGreaterThan(root.right.value - 64f)
        assertThat(camera.right.value).isAtMost(fold.left.value)
        assertThat(pill.right.value).isLessThan(camera.left.value)
    }

    @Test fun `#14661 ouvrir le plateau des pièces le dit à l'hôte, le refermer aussi — la story se fige dessous`() {
        val reports = mutableListOf<Boolean>()
        show(spec(ComposerConfiguration.COMMENT).served().copy(onPickPlace = {}, onPanelOpenChange = { reports += it }))
        compose.onNodeWithContentDescription(string(R.string.chat_attach_open)).performClick()
        compose.waitForIdle()
        assertThat(reports.lastOrNull()).isTrue()
        compose.onNodeWithContentDescription(string(R.string.composer_show_keyboard)).performClick()
        compose.waitForIdle()
        assertThat(reports.last()).isFalse()
    }

    @Test fun `#14661 le panneau des effets ouvert retient aussi l'hôte`() {
        val reports = mutableListOf<Boolean>()
        show(spec(ComposerConfiguration.COMMENT).served().copy(onToggleEffect = {}, onPanelOpenChange = { reports += it }))
        compose.onNodeWithContentDescription(string(R.string.chat_effects_open)).performClick()
        compose.waitForIdle()
        assertThat(reports.lastOrNull()).isTrue()
    }

    @Test fun `un commentaire écrit part par l'envoi`() {
        var sent = 0
        show(spec(ComposerConfiguration.COMMENT, draft = "Bravo", onSend = { sent += 1 }))
        compose.onNodeWithContentDescription(string(R.string.chat_send)).performClick()
        assertThat(sent).isEqualTo(1)
    }
}

/** La bande d'emojis rapides ignore un toucher dans la demi-seconde qui suit son arrivée (horloge réelle). */
private const val QUICK_EMOJI_ARRIVAL_WAIT_MS = 600L
