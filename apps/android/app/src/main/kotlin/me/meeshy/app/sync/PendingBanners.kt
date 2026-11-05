package me.meeshy.app.sync

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
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
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import me.meeshy.app.R
import me.meeshy.app.startup.AppOverlay
import me.meeshy.sdk.model.syncpill.PendingBanners
import me.meeshy.sdk.outbox.OfflineQueuePillProviding
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

@Immutable
data class PendingBannersUiState(val settingsCount: Int = 0)

/**
 * Le bandeau ambre du haut de l'écran (miroir d'iOS `RootPendingBanners`) : « Modifications en attente (N) », compté
 * depuis l'outbox. Une story en attente ne s'annonce JAMAIS ici (#15223) : elle se lit à l'horloge (anneau du plateau,
 * « File » de Mes stories).
 */
@HiltViewModel
class PendingBannersViewModel @Inject constructor(
    queue: OfflineQueuePillProviding,
) : ViewModel() {
    val uiState: StateFlow<PendingBannersUiState> = queue.pendingUiItems
        .map(PendingBanners::pendingSettings)
        .distinctUntilChanged()
        .map { PendingBannersUiState(settingsCount = it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PendingBannersUiState())
}

@Composable
internal fun PendingBannersHost(modifier: Modifier = Modifier, viewModel: PendingBannersViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    Column(
        modifier = modifier
            .fillMaxSize()
            .statusBarsPadding()
            .padding(top = MeeshySpacing.xxxl + MeeshySpacing.lg),
    ) {
        PendingBanner(
            visible = state.settingsCount > 0,
            title = "${stringResource(R.string.root_pending_changes)} (${state.settingsCount})",
            subtitle = stringResource(R.string.root_sync_on_reconnect),
        )
    }
}

@Composable
private fun PendingBanner(visible: Boolean, title: String, subtitle: String) {
    val spec = spring<Float>(dampingRatio = 0.8f, stiffness = me.meeshy.ui.theme.MeeshyMotion.stiffnessForResponse(0.4f))
    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(spring(dampingRatio = 0.8f, stiffness = me.meeshy.ui.theme.MeeshyMotion.stiffnessForResponse(0.4f))) { -it } + fadeIn(spec),
        exit = slideOutVertically { -it } + fadeOut(),
    ) {
        val ink = MeeshyPalette.Indigo950
        Row(
            modifier = Modifier
                .padding(horizontal = MeeshySpacing.lg)
                .fillMaxWidth()
                .shadow(6.dp, RoundedCornerShape(MeeshyRadius.sm), ambientColor = MeeshyPalette.Warning, spotColor = MeeshyPalette.Warning)
                .background(
                    Brush.horizontalGradient(listOf(MeeshyPalette.Warning, MeeshyPalette.Amber500)),
                    RoundedCornerShape(MeeshyRadius.sm),
                )
                .padding(horizontal = MeeshySpacing.md + 2.dp, vertical = MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Icon(imageVector = MeeshyIcons.Sync, contentDescription = null, tint = ink)
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
