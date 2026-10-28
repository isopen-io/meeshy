package me.meeshy.app.composer.host

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import me.meeshy.app.R
import me.meeshy.app.feed.FeedViewModel
import me.meeshy.app.feed.MoodComposerContent
import me.meeshy.app.feed.PostComposerContent
import me.meeshy.app.feed.StatusComposerDraftsViewModel
import me.meeshy.app.feed.StatusesViewModel
import me.meeshy.app.stories.StoryComposerContent
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.ui.component.composer.LocalOnComposerPlateau

/**
 * UN composeur : la porte donne le format d'ouverture, le document (texte, médias, scène, audience) est UN, et le
 * format n'est qu'un de ses champs. Les anciennes surfaces — scène de story, feuille de post/réel, feuille de mood —
 * sont les CONTENUS de l'hôte, pas des portes : chacune garde son brouillon, son envoi durable et ses médias.
 * Le choix du format vit dans le couloir du haut de chaque contenu (jamais sur la scène) et grise avec sa raison.
 *
 * [feedOwner] est l'entrée du FIL quand elle est dans la pile : les ViewModels du fil, des moods et de leurs brouillons
 * y sont PARTAGÉS avec l'écran qu'on quitte — une seule instance (pas de second chargement du fil), et une publication
 * ou une sauvegarde différée qui survit à la fermeture de l'hôte (l'entrée de l'hôte meurt avec lui). Hors du fil
 * (porte du plateau de stories), l'hôte garde ses propres instances.
 */
@Composable
fun ComposerHostScreen(
    onClose: () -> Unit,
    feedOwner: ViewModelStoreOwner? = null,
    viewModel: ComposerHostViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val shared = feedOwner ?: checkNotNull(LocalViewModelStoreOwner.current)
    val sayMediaStayBehind = { Toast.makeText(context, R.string.composer_format_media_stay_behind, Toast.LENGTH_LONG).show() }
    val choose: (ComposerFormat) -> Unit = { format ->
        viewModel.choose(format)
        if ((viewModel.state.value.carry?.plan?.leftBehind ?: 0) > 0) sayMediaStayBehind()
    }
    val onCarryApplied: (Int, Int) -> Unit = { token, lost -> if (viewModel.onCarryApplied(token, lost)) sayMediaStayBehind() }
    val formatMenu: @Composable () -> Unit = {
        ComposerFormatMenu(state.selectedFormat, state.verdicts, choose)
    }
    when (state.selectedFormat) {
        ComposerFormat.STORY -> CompositionLocalProvider(LocalOnComposerPlateau provides true) { StoryComposerContent(
            seedText = state.text,
            onFacts = viewModel::onStoryFacts,
            carry = state.carry,
            onCarryApplied = onCarryApplied,
            onClose = onClose,
            titleContent = formatMenu,
        ) }
        ComposerFormat.POST, ComposerFormat.REEL -> CompositionLocalProvider(LocalOnComposerPlateau provides true) { PostComposerContent(
            seedText = state.text,
            onFacts = viewModel::onPostFacts,
            carry = state.carry,
            onCarryApplied = onCarryApplied,
            onClose = onClose,
            onMediaError = { Toast.makeText(context, it, Toast.LENGTH_SHORT).show() },
            formatSlot = formatMenu,
            governingType = state.chosen?.postType,
            offerReel = state.offersReelForPost,
            onFormatChosen = viewModel::choose,
            viewModel = hiltViewModel<FeedViewModel>(shared),
        ) }
        ComposerFormat.STATUS -> CompositionLocalProvider(LocalOnComposerPlateau provides true) { MoodComposerContent(
            seedText = state.text,
            onText = viewModel::onMoodFacts,
            onClose = onClose,
            formatSlot = formatMenu,
            viewModel = hiltViewModel<StatusesViewModel>(shared),
            drafts = hiltViewModel<StatusComposerDraftsViewModel>(shared),
        ) }
    }
}
