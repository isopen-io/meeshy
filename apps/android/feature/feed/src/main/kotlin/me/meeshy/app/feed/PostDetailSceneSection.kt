package me.meeshy.app.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.PostDetailSceneFraming
import me.meeshy.sdk.model.PostDetailScenePlayback
import me.meeshy.ui.component.media.MosaicArrangement
import me.meeshy.ui.component.media.MosaicLayout
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Ce que la fiche sait de sa zone de défilement, en pixels de la fenêtre : de quoi cadrer la scène au-dessus du composer et la
 * mettre en pause hors écran. [composerFocused] : le clavier est levé (la scène ne rétrécit pas sous la frappe, #8647).
 */
@Immutable
internal data class PostDetailViewport(
    val top: Float,
    val bottom: Float,
    val scrollOffset: Float,
    val composerFocused: Boolean,
)

/**
 * **La section scène de la fiche d'un post** (iOS `PostDetailView+Canvas`) : la scène se voit ENTIÈRE avec sa rangée d'actions
 * au-dessus du composer ([PostDetailSceneFraming]) ; l'en-tête de son ([PostSceneSoundHeader]) et le coupe-son n'existent que
 * si un canvas est réellement rendu et porte du son ([PostDetailScenePlayback.showsSoundControls], la porte du rendu) ; le
 * son est ACTIF par défaut et la lecture se met en pause hors écran. Toucher la scène l'ouvre en plein écran (le lecteur
 * partagé de [PostScenesView]). Sans canvas à rendre : un placeholder, jamais un rectangle noir.
 *
 * [viewport] est lu hors composition (callbacks de mise en page et flux d'instantanés) : le défilement ne recompose pas la fiche.
 */
@Composable
internal fun PostDetailSceneSection(
    scenes: FeedPostScenes,
    modifier: Modifier = Modifier,
    viewport: (() -> PostDetailViewport)? = null,
) {
    val rendered = LocalPostSceneCardRenderer.current != null && scenes.items.isNotEmpty()
    if (!rendered) {
        PostDetailSceneUnavailable(modifier)
        return
    }
    var muted by rememberSaveable { mutableStateOf(false) }
    var paused by rememberSaveable { mutableStateOf(false) }
    var visible by remember { mutableStateOf(true) }
    var measures by remember { mutableStateOf(PostDetailSceneFraming.Measures()) }
    val density = LocalDensity.current
    val readViewport = rememberUpdatedState(viewport)
    var scene by remember { mutableStateOf<LayoutCoordinates?>(null) }

    fun refresh(width: Float) {
        val page = readViewport.value?.invoke() ?: return
        val heightDp = (page.bottom - page.top) / density.density
        var next = measures.recordingViewport(width, heightDp, page.composerFocused)
        val coords = scene?.takeIf(LayoutCoordinates::isAttached)
        if (coords != null) {
            val bounds = coords.boundsInRoot()
            visible = PostDetailScenePlayback.isVisible(bounds.top, bounds.bottom, page.top, page.bottom)
            next = next.recordingSceneTop((bounds.top - page.top) / density.density, page.scrollOffset / density.density)
        }
        if (next != measures) measures = next
    }

    BoxWithConstraints(modifier.fillMaxWidth()) {
        val containerWidth = maxWidth.value
        LaunchedEffect(containerWidth) {
            snapshotFlow { readViewport.value?.invoke() }.collect { refresh(containerWidth) }
        }
        val framing = remember(scenes, measures, containerWidth) { framingOf(scenes, measures, containerWidth) }
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs), horizontalAlignment = Alignment.CenterHorizontally) {
            if (PostDetailScenePlayback.showsSoundControls(rendered = true, offersSound = scenes.offersSound)) {
                PostSceneSoundHeader(
                    credit = scenes.soundCredit,
                    muted = muted,
                    paused = paused,
                    onToggleMute = { muted = !muted },
                    onTogglePlayback = { paused = !paused },
                )
            }
            Box(
                Modifier
                    .then(if (framing != null) Modifier.widthIn(max = framing.width.dp) else Modifier)
                    .onGloballyPositioned { coordinates ->
                        scene = coordinates
                        refresh(containerWidth)
                    },
            ) {
                PostScenesView(
                    scenes = scenes,
                    live = !PostDetailScenePlayback.isPaused(visible = visible, viewerPaused = paused),
                    host = PostScenesHost.DETAIL,
                    muted = muted,
                )
            }
        }
    }
}

private const val PAGER_DOTS_HEIGHT = 16f

private fun framingOf(scenes: FeedPostScenes, measures: PostDetailSceneFraming.Measures, width: Float): PostDetailSceneFraming.Size? {
    val (ratio, accessory) = when (val arrangement = MosaicLayout.arrange(scenes.items.size, scenes.layout)) {
        MosaicArrangement.Empty -> return null
        MosaicArrangement.Single -> scenes.carouselAspect.toFloat() to 0f
        is MosaicArrangement.Paged -> scenes.carouselAspect.toFloat() to PAGER_DOTS_HEIGHT
        is MosaicArrangement.Tiled -> (1f / arrangement.aspectRatio) to 0f
    }
    return PostDetailSceneFraming.sceneSize(
        ratio = ratio,
        measures = measures.copy(viewportWidth = width),
        horizontalInset = 0f,
        accessoryHeight = accessory,
    )
}

@Composable
private fun PostDetailSceneUnavailable(modifier: Modifier) {
    Text(
        text = stringResource(R.string.feed_post_detail_story_unavailable),
        color = MeeshyTheme.tokens.textSecondary,
        textAlign = TextAlign.Center,
        modifier = modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xl),
    )
}
