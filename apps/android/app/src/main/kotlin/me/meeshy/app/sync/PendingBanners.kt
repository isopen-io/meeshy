package me.meeshy.app.sync

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavHostController
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import me.meeshy.app.R
import me.meeshy.app.startup.AppOverlay
import me.meeshy.sdk.model.syncpill.PendingBanners
import me.meeshy.sdk.outbox.OfflineQueuePillProviding
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

@Immutable
data class PendingBannersUiState(
    val settingsCount: Int = 0,
    val storyCount: Int = 0,
    val storyVisible: Boolean = false,
)

/**
 * Les deux bandeaux ambre du haut de l'écran (miroir d'iOS `RootPendingBanners`) : « Modifications en attente (N) » et
 * « Stories en attente (N) ». Les comptes se dérivent de l'outbox ; le bandeau des stories se masque d'un glissement et
 * ne revient que si son compte change.
 */
@HiltViewModel
class PendingBannersViewModel @Inject constructor(
    queue: OfflineQueuePillProviding,
) : ViewModel() {
    private val dismissedAtCount = MutableStateFlow<Int?>(null)

    val uiState: StateFlow<PendingBannersUiState> = combine(
        queue.pendingUiItems.map(PendingBanners::counts).distinctUntilChanged(),
        dismissedAtCount,
    ) { counts, dismissedAt ->
        PendingBannersUiState(
            settingsCount = counts.settings,
            storyCount = counts.stories,
            storyVisible = PendingBanners.isStoryBannerVisible(counts.stories, dismissedAt),
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PendingBannersUiState())

    fun dismissStories() {
        dismissedAtCount.value = uiState.value.storyCount
    }
}

@Composable
internal fun PendingBannersHost(modifier: Modifier = Modifier, viewModel: PendingBannersViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    Column(
        modifier = modifier
            .fillMaxSize()
            .statusBarsPadding()
            .padding(top = MeeshySpacing.xxxl + MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs + 2.dp),
    ) {
        PendingBanner(
            visible = state.settingsCount > 0,
            icon = BannerIcon.SYNC,
            title = "${stringResource(R.string.root_pending_changes)} (${state.settingsCount})",
            subtitle = stringResource(R.string.root_sync_on_reconnect),
            onDismiss = null,
        )
        PendingBanner(
            visible = state.storyVisible,
            icon = BannerIcon.STORIES,
            title = "${stringResource(R.string.root_pending_stories)} (${state.storyCount})",
            subtitle = stringResource(R.string.root_publish_on_reconnect),
            onDismiss = {
                viewModel.dismissStories()
                haptics.light()
            },
        )
    }
}

private enum class BannerIcon { SYNC, STORIES }

@Composable
private fun PendingBanner(
    visible: Boolean,
    icon: BannerIcon,
    title: String,
    subtitle: String,
    onDismiss: (() -> Unit)?,
) {
    val density = LocalDensity.current
    val spec = spring<Float>(dampingRatio = 0.8f, stiffness = me.meeshy.ui.theme.MeeshyMotion.stiffnessForResponse(0.4f))
    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(spring(dampingRatio = 0.8f, stiffness = me.meeshy.ui.theme.MeeshyMotion.stiffnessForResponse(0.4f))) { -it } + fadeIn(spec),
        exit = slideOutVertically { -it } + fadeOut(),
    ) {
        val ink = MeeshyPalette.Indigo950
        val dismissLabel = stringResource(R.string.common_dismiss)
        var dx = 0f
        var dy = 0f
        Row(
            modifier = Modifier
                .padding(horizontal = MeeshySpacing.lg)
                .fillMaxWidth()
                .shadow(6.dp, RoundedCornerShape(MeeshyRadius.sm), ambientColor = MeeshyPalette.Warning, spotColor = MeeshyPalette.Warning)
                .background(
                    Brush.horizontalGradient(listOf(MeeshyPalette.Warning, MeeshyPalette.Amber500)),
                    RoundedCornerShape(MeeshyRadius.sm),
                )
                .let { base ->
                    if (onDismiss == null) {
                        base
                    } else {
                        base
                            .pointerInput(Unit) {
                                detectDragGestures(
                                    onDragStart = { dx = 0f; dy = 0f },
                                    onDrag = { change, amount ->
                                        change.consume()
                                        dx += amount.x
                                        dy += amount.y
                                    },
                                    onDragEnd = {
                                        val moved = with(density) { dx.toDp().value to dy.toDp().value }
                                        if (PendingBanners.shouldDismiss(moved.first, moved.second)) onDismiss()
                                    },
                                )
                            }
                            .semantics { customActions = listOf(CustomAccessibilityAction(dismissLabel) { onDismiss(); true }) }
                    }
                }
                .padding(horizontal = MeeshySpacing.md + 2.dp, vertical = MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Icon(
                imageVector = if (icon == BannerIcon.SYNC) Icons.Filled.Sync else Icons.Filled.PhotoLibrary,
                contentDescription = null,
                tint = ink,
            )
            Text(
                text = title,
                color = ink,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = subtitle,
                color = ink.copy(alpha = 0.72f),
                fontSize = 10.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

class PendingBannersOverlay @Inject constructor() : AppOverlay {
    override val order: Int = 290

    @Composable
    override fun Content(navController: NavHostController) {
        PendingBannersHost()
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface PendingBannersOverlayModule {
    @Binds
    @IntoSet
    fun bind(overlay: PendingBannersOverlay): AppOverlay
}
