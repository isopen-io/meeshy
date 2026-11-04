package me.meeshy.app.calls

import android.content.ComponentCallbacks2
import android.content.res.Configuration
import android.graphics.Bitmap
import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.frames.CallFramePortrait
import me.meeshy.sdk.call.frames.CallFrameThumbnailCache
import me.meeshy.sdk.call.frames.CallFrameRenderer
import me.meeshy.sdk.model.call.frames.CallFrameDesign
import me.meeshy.sdk.model.call.frames.CallFrameMood
import me.meeshy.sdk.model.call.frames.CallFramePerson
import me.meeshy.sdk.model.call.frames.CallFrameScope
import me.meeshy.sdk.model.call.frames.CallFrameStyleRule
import me.meeshy.sdk.model.call.frames.CallFrameTexts
import me.meeshy.sdk.model.call.frames.CallLiveFrameRule
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallModeGestureRule
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageFrameRule
import me.meeshy.sdk.model.call.montage.CallMontageHold
import me.meeshy.sdk.model.call.montage.CallMontageMoodChip
import me.meeshy.sdk.model.call.montage.CallMontagePickRule
import me.meeshy.sdk.model.call.montage.CallMontageScopeToggle
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

@Composable
internal fun MontageCell(
    item: CallMontageChoice,
    posed: CallMontageChoice,
    isSelected: Boolean,
    previews: CallCapturePreviews,
    people: List<CallFramePerson>,
    onDecline: (String) -> Unit,
) {
    val shape = RoundedCornerShape(MeeshyRadius.sm)
    Box(
        Modifier
            .fillMaxSize()
            .clip(shape)
            .background(Color.White.copy(alpha = 0.08f))
            .border(if (isSelected) 2.dp else 1.dp, if (isSelected) Color.White else Color.White.copy(alpha = 0.3f), shape),
        contentAlignment = Alignment.Center,
    ) {
        when (item) {
            is CallMontageChoice.Classic -> {
                val thumbnail = previews.thumbnails[item.style]
                if (thumbnail != null) {
                    Image(thumbnail.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                } else {
                    Icon(styleGlyph(item.style), contentDescription = null, tint = CallPalette.InkSecondary, modifier = Modifier.size(20.dp))
                }
            }
            is CallMontageChoice.Frame -> {
                val declinations = remember(item.id) { CallFrameStyleRule.declinations(item.id) }
                val posedId = (posed as? CallMontageChoice.Frame)?.id ?: item.id
                if (isSelected && declinations.size > 1) {
                    CallFrameDeclinationPager(declinations = declinations, selected = posedId, onSelect = onDecline) { declined ->
                        FrameTile(declined, previews.frameThumbnails[declined.id], people)
                    }
                } else {
                    val design = remember(item.id) { CallMontageFrameRule.design(item.id) }
                    design?.let { FrameTile(it, previews.frameThumbnails[it.id], people) }
                }
            }
        }
    }
}

/** La vignette d'un cadre peinte sur les visages de l'appel ; en attendant, le cadre avec les initiales — jamais un spinner. */
@Composable
internal fun FrameTile(design: CallFrameDesign, painted: Bitmap?, people: List<CallFramePerson>) {
    if (painted != null) {
        Image(painted.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
    } else {
        FrameThumbnail(design, people)
    }
}

internal fun choiceName(choice: CallMontageChoice, classicNames: Map<CallMontageStyle, String>, language: String?): String = when (choice) {
    is CallMontageChoice.Classic -> classicNames[choice.style].orEmpty()
    is CallMontageChoice.Frame -> CallMontageFrameRule.frameName(choice.id, language = language).orEmpty()
}

/** Le glyphe qui tient la place d'une vignette tant qu'elle n'est pas peinte (iOS `CallCaptureCopy.styleSymbol`) — jamais un spinner. */
internal fun styleGlyph(style: CallMontageStyle): ImageVector = when (style) {
    CallMontageStyle.SCREEN -> MeeshyIcons.PictureInPicture
    CallMontageStyle.COVER -> MeeshyIcons.Article
    CallMontageStyle.GOLD -> MeeshyIcons.Premium
    CallMontageStyle.REDCARPET -> MeeshyIcons.Star
    CallMontageStyle.GRID -> MeeshyIcons.GridView
    CallMontageStyle.STRIP -> MeeshyIcons.VerticalSplit
    CallMontageStyle.POLAROID -> MeeshyIcons.Photo
    CallMontageStyle.MAGAZINE -> MeeshyIcons.Dictionary
    CallMontageStyle.FILM -> MeeshyIcons.Movie
    CallMontageStyle.NEON -> MeeshyIcons.Sparkles
    CallMontageStyle.NOIR -> MeeshyIcons.Camera
    CallMontageStyle.COMIC -> MeeshyIcons.TextBubble
    CallMontageStyle.HEART -> MeeshyIcons.Heart
}

