package me.meeshy.app.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.unit.IntOffset
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.feed.MoodQueuedToast
import me.meeshy.app.feed.MoodReactFailureToast
import me.meeshy.app.feed.MoodRepostRefusedToast
import me.meeshy.app.feed.StatusesViewModel
import me.meeshy.app.startup.AppLocalsProvider
import me.meeshy.app.startup.AppOverlay
import me.meeshy.sdk.status.StatusBubbleController

/** Donne aux portes (rail, liste) l'unique contrôleur de la bulle, sans qu'elles connaissent Hilt. */
@HiltViewModel
class StatusBubbleHandle @Inject constructor(val controller: StatusBubbleController) : ViewModel()

@Composable
internal fun rememberStatusBubbleController(): StatusBubbleController = hiltViewModel<StatusBubbleHandle>().controller

/**
 * Note le point où le doigt se pose, sans rien consommer : la bulle d'humeur s'ancre au badge TOUCHÉ (iOS
 * `StatusBubbleController.show(entry:anchor:)`), et aucun badge n'a à connaître sa position.
 */
class StatusBubbleTouchProvider @Inject constructor(
    private val controller: StatusBubbleController,
) : AppLocalsProvider {
    override val order: Int = 90

    @Composable
    override fun Provide(content: @Composable () -> Unit) {
        var windowOrigin by remember { mutableStateOf(Offset.Zero) }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .onGloballyPositioned { windowOrigin = it.positionInWindow() }
                .pointerInput(controller) {
                    awaitPointerEventScope {
                        while (true) {
                            val event = awaitPointerEvent(PointerEventPass.Initial)
                            event.changes.firstOrNull { it.pressed && !it.previousPressed }?.let { down ->
                                controller.noteTouch(windowOrigin.x + down.position.x, windowOrigin.y + down.position.y)
                            }
                        }
                    }
                },
        ) { content() }
    }
}

/**
 * L'hôte UNIQUE de la bulle d'humeur pour toute la fenêtre (iOS `RootStatusBubbleLayer`) : le rail, la liste des
 * conversations ou une autre porte la montrent par [StatusBubbleController.show] ; elle se dessine ici, dans le
 * repère de la fenêtre, et se ferme à toute navigation (jeton = la route). La vue de l'humeur se compte ici, au
 * site unique de l'ouverture, quelle que soit la porte.
 */
class StatusBubbleOverlay @Inject constructor(
    private val controller: StatusBubbleController,
) : AppOverlay {
    override val order: Int = 45

    @Composable
    override fun Content(navController: NavHostController) {
        val backStack by navController.currentBackStackEntryAsState()
        val routeToken = backStack?.id
        LaunchedEffect(routeToken) { controller.onNavigationToken(routeToken) }
        val shown by controller.state.collectAsStateWithLifecycle()
        var everShown by remember { mutableStateOf(false) }
        if (shown.entry != null) everShown = true
        if (everShown) StatusBubbleLayer(navController, controller)
    }
}

@Composable
private fun StatusBubbleLayer(navController: NavHostController, controller: StatusBubbleController) {
    val statusesViewModel: StatusesViewModel = hiltViewModel()
    val shown by controller.state.collectAsStateWithLifecycle()
    val statuses by statusesViewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(shown.entry?.id) {
        shown.entry?.takeIf { it.userId != statuses.myStatus?.userId }?.let { statusesViewModel.markStatusViewed(it.id) }
    }
    MoodBubbleHost(
        shown = shown.entry,
        myUserId = statuses.myStatus?.userId,
        navController = navController,
        statusesViewModel = statusesViewModel,
        anchor = shown.anchor?.let { IntOffset(it.x.toInt(), it.y.toInt()) },
        onDismiss = controller::dismiss,
    )
    MoodReactFailureToast(statusesViewModel.reactFailed)
    MoodRepostRefusedToast(statusesViewModel.repostAudienceRefused)
    MoodQueuedToast(statusesViewModel.moodQueued)
}

@Module
@InstallIn(SingletonComponent::class)
internal interface StatusBubbleRootModule {
    @Binds
    @IntoSet
    fun bindTouch(provider: StatusBubbleTouchProvider): AppLocalsProvider

    @Binds
    @IntoSet
    fun bindOverlay(overlay: StatusBubbleOverlay): AppOverlay
}
