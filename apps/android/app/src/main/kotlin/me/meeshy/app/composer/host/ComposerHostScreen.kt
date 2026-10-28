package me.meeshy.app.composer.host

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.feed.MoodComposerContent
import me.meeshy.app.feed.PostComposerContent
import me.meeshy.app.stories.StoryComposerContent
import me.meeshy.sdk.model.composer.ComposerFormat

/**
 * UN composeur : la porte donne le format d'ouverture, le document (texte, médias, scène, audience) est UN, et le
 * format n'est qu'un de ses champs. Les anciennes surfaces — scène de story, feuille de post/réel, feuille de mood —
 * sont les CONTENUS de l'hôte, pas des portes : chacune garde son brouillon, son envoi durable et ses médias.
 * Le choix du format vit dans le couloir du haut de chaque contenu (jamais sur la scène) et grise avec sa raison.
 */
@Composable
fun ComposerHostScreen(
    onClose: () -> Unit,
    viewModel: ComposerHostViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val formatMenu: @Composable () -> Unit = {
        ComposerFormatMenu(state.selectedFormat, state.verdicts, viewModel::choose)
    }
    when (state.selectedFormat) {
        ComposerFormat.STORY -> StoryComposerContent(
            seedText = state.text,
            onFacts = viewModel::onStoryFacts,
            onClose = onClose,
            titleContent = formatMenu,
        )
        ComposerFormat.POST, ComposerFormat.REEL -> PostComposerContent(
            seedText = state.text,
            onFacts = { facts -> viewModel.onPostFacts(facts.text, facts.media) },
            onClose = onClose,
            onMediaError = { Toast.makeText(context, it, Toast.LENGTH_SHORT).show() },
            formatSlot = formatMenu,
            governingType = state.chosen?.postType,
            offerReel = state.offersReelForPost,
            onFormatChosen = viewModel::choose,
        )
        ComposerFormat.STATUS -> MoodComposerContent(
            seedText = state.text,
            onText = viewModel::onMoodFacts,
            onClose = onClose,
            formatSlot = formatMenu,
        )
    }
}
