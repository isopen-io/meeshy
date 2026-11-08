package me.meeshy.app.stories

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import me.meeshy.app.feed.rememberContentShareOut
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.composer.StoryRepostAudience
import me.meeshy.sdk.model.story.StoryRepostDestination
import me.meeshy.sdk.model.share.ShareCard
import me.meeshy.sdk.model.share.ShareCards
import me.meeshy.sdk.model.share.ShareSubject
import me.meeshy.sdk.model.story.StoryOptionsMenuEntry
import me.meeshy.sdk.model.story.StoryTranscriptState
import me.meeshy.feature.stories.R
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.share.LocalShareLauncher
import me.meeshy.ui.share.open

/**
 * Propriétaire : lot story-viewer-decomposition-and-nav-graph. Ce que le lecteur FAIT d'une story courante quand
 * l'utilisateur touche le menu ou le rail : partager, envoyer, republier, ouvrir un profil, fermer. Un lot qui
 * ajoute un geste de menu l'ajoute ICI, jamais dans l'hôte.
 */
internal class StoryViewerActions(
    val onClose: () -> Unit,
    val onOpenProfile: (String) -> Unit,
    val onEditStory: ((String) -> Unit)?,
    val onComposeStory: ((String) -> Unit)?,
    val share: () -> Unit,
    val openSendTo: () -> Unit,
    val repost: () -> Unit,
    /** « Republier » en post ou en réel, du sous-menu Partager (#15067) ; `null` : pas la story d'un autre, ou audience qui ne se repartage pas. */
    val repostTo: ((StoryRepostDestination) -> Unit)? = null,
    /** Les entrées du menu ⋮ qu'un autre lot branche (plein écran, transcription, imager, rendre privée). */
    val entryHandlers: Map<StoryOptionsMenuEntry, StoryMenuEntryAction> = emptyMap(),
)

/** Une entrée de menu branchée de l'extérieur : son libellé, son icône et son geste. */
internal class StoryMenuEntryAction(
    @StringRes val labelRes: Int,
    val icon: ImageVector,
    val onClick: () -> Unit,
)

/** L'audience d'une story qui s'ouvre sans compte — la seule qui reçoit un lien suivi (#14315). */
private const val PUBLIC_STORY_VISIBILITY = "PUBLIC"

@Composable
internal fun rememberStoryViewerActions(
    state: StoryViewerUiState,
    currentItem: StoryItem?,
    chrome: StoryViewerChromeState,
    haptics: MeeshyHaptics,
    fullscreen: StoryFullscreenSession,
    viewModel: StoryViewerViewModel,
    onClose: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onEditStory: ((String) -> Unit)?,
    onComposeStory: ((String) -> Unit)?,
    imager: (() -> Unit)? = null,
): StoryViewerActions {
    val shareLauncher = LocalShareLauncher.current
    val context = LocalContext.current
    val shareOut = rememberContentShareOut()

    fun storyCard(): ShareCard? = state.currentStoryId?.let { storyId ->
        ShareCards.story(
            storyId = storyId,
            authorId = null,
            messageText = context.getString(R.string.share_story_text, state.authorName, ShareCards.storyUrl(storyId)),
            isPublic = currentItem?.visibility.equals(PUBLIC_STORY_VISIBILITY, ignoreCase = true),
        )
    }

    // « Envoyer » (#14315) : la feuille Meeshy, qui frappe le lien de l'utilisateur pour une story publique.
    fun openSendTo() {
        val card = storyCard() ?: return
        val launcher = shareLauncher ?: return shareOut(card)
        chrome.showSendTo = true
        launcher.open(ShareSubject.Card(card)) { chrome.showSendTo = false }
    }

    return StoryViewerActions(
        onClose = onClose,
        onOpenProfile = onOpenProfile,
        onEditStory = onEditStory,
        onComposeStory = onComposeStory,
        share = { storyCard()?.let(shareOut) },
        openSendTo = ::openSendTo,
        // « Republier » (#14443) : un geste publie, comme le rail iOS ; le lecteur reste ouvert et dit l'issue.
        repost = {
            haptics.light()
            viewModel.repostCurrentStory()
        },
        repostTo = { destination: StoryRepostDestination ->
            haptics.light()
            viewModel.repostCurrentStory(destination)
        }.takeIf { !state.isOwnStory && StoryRepostAudience.isRepublishable(currentItem?.visibility) },
        entryHandlers = buildMap {
            put(StoryOptionsMenuEntry.Fullscreen, fullscreenMenuEntry(fullscreen, haptics))
            if (StoryTranscriptState.isAvailable(currentItem?.storyEffects)) put(StoryOptionsMenuEntry.Transcript, transcriptMenuEntry(chrome, haptics))
            imager?.let { put(StoryOptionsMenuEntry.Imager, imagerMenuEntry(it, haptics)) }
        },
    )
}

private fun imagerMenuEntry(imager: () -> Unit, haptics: MeeshyHaptics): StoryMenuEntryAction =
    StoryMenuEntryAction(
        labelRes = R.string.stories_viewer_export_imager,
        icon = MeeshyIcons.PhotoFilled,
        onClick = {
            haptics.light()
            imager()
        },
    )

/** « Transcription » du menu ⋮ : éteinte par défaut, elle remplace la légende tant qu'elle est demandée. */
private fun transcriptMenuEntry(chrome: StoryViewerChromeState, haptics: MeeshyHaptics): StoryMenuEntryAction =
    StoryMenuEntryAction(
        labelRes = R.string.story_viewer_transcript_title,
        icon = MeeshyIcons.Subtitles,
        onClick = {
            haptics.light()
            chrome.transcript = chrome.transcript.toggled()
        },
    )

/** « Plein écran » / « Quitter le plein écran » du menu ⋮ : la même bascule que le glissé haut (iOS, un comportement, deux entrées). */
private fun fullscreenMenuEntry(fullscreen: StoryFullscreenSession, haptics: MeeshyHaptics): StoryMenuEntryAction =
    StoryMenuEntryAction(
        labelRes = if (fullscreen.enabled) R.string.stories_viewer_fullscreen_exit else R.string.stories_viewer_fullscreen_enter,
        icon = if (fullscreen.enabled) MeeshyIcons.CloseFullscreen else MeeshyIcons.OpenInFull,
        onClick = {
            haptics.light()
            fullscreen.toggle()
        },
    )
