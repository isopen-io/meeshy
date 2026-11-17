package me.meeshy.app.calls

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallTopBanner
import me.meeshy.sdk.model.call.CallTopBannerStack
import me.meeshy.sdk.model.call.CallVideoNotice
import me.meeshy.ui.theme.MeeshySpacing
import javax.inject.Inject
import javax.inject.Singleton

/**
 * L'indicateur discret de ma vidéo : image réduite pour laisser refroidir le téléphone, ou lumière insuffisante. Une capsule du
 * verre de l'écran d'appel sous son voile de ton (loi 18.1), annoncée aux lecteurs d'écran, qui disparaît d'elle-même au retour
 * à la normale. Deux lignes au plus : la phrase tient en allemand ou en arabe, police agrandie comprise.
 */
@Composable
internal fun CallVideoNoticePill(notice: CallVideoNotice, modifier: Modifier = Modifier) {
    val text = when (notice) {
        CallVideoNotice.None -> return
        CallVideoNotice.Reduced -> stringResource(R.string.call_video_notice_reduced)
        CallVideoNotice.LowLight -> stringResource(R.string.call_video_notice_low_light)
    }
    CallGlassPlate(
        modifier = modifier.semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        shape = CircleShape,
    ) {
        CallToneScrim()
        Text(
            text = text,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = CallPalette.Ink,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        )
    }
}

/**
 * E4 (#18227) — « Vidéo réduite / Faible lumière » est un maillon de la pile des bannières du haut, juste sous « En attente » :
 * elle arrive du haut et y repart ([CallBannerPresence], le dernier texte reste le temps de la sortie), et ma vignette descend
 * sous elle. Quand elle se montre, c'est la loi pure qui le dit ([servicePills]) : appel vidéo établi, caméra allumée, hors
 * image dans l'image. Elle se range au premier toucher avec les bannières et revient au second ([CallServicePillFade], #18398).
 */
@Singleton
class CallVideoNoticeOverlay @Inject constructor() : CallOverlay {
    override val id: String = "call-video-notice"
    override val slot: CallOverlaySlot = CallOverlaySlot.TopBanner
    override val priority: Int = CallTopBannerStack.priority(CallTopBanner.VideoNotice)

    @Composable
    override fun Content(context: CallOverlayContext) {
        val notice = context.servicePills().videoNotice
        CallBannerPresence(notice.takeIf { it != CallVideoNotice.None }) { shown ->
            CallServicePillFade(context) {
                CallVideoNoticePill(
                    notice = shown,
                    modifier = Modifier
                        .padding(horizontal = CallTopBannerStack.HORIZONTAL_MARGIN_DP.dp)
                        .padding(top = CallTopBannerStack.GAP_DP.dp)
                        .reportsTopBannerHeight(CallTopBanner.VideoNotice),
                )
            }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallVideoNoticeOverlayModule {
    @Binds
    @IntoSet
    fun bindCallVideoNoticeOverlay(impl: CallVideoNoticeOverlay): CallOverlay
}
