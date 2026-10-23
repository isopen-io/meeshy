package me.meeshy.app.calls

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallActionFamily
import me.meeshy.sdk.model.call.CallChromeScrollRule
import me.meeshy.ui.theme.MeeshySpacing

internal val CALL_ROW_CELL_WIDTH = 68.dp
internal val CALL_ROW_GLYPH_DIAMETER = 44.dp

@Composable
internal fun callFamilyTitle(family: CallActionFamily?): String? = when (family) {
    CallActionFamily.MyImage -> stringResource(me.meeshy.feature.calls.R.string.call_actions_my_image)
    CallActionFamily.TheCall -> stringResource(me.meeshy.feature.calls.R.string.call_actions_the_call)
    else -> null
}

/**
 * One row of the unfolded pill: an optional title (the family) over a horizontally scrolling line
 * of captioned buttons. A row that scrolls is a finger on the chrome: it holds the auto-hide and
 * lets go when it stops.
 */
@Composable
internal fun CallActionRow(
    title: String?,
    items: List<CallPillItem>,
    onAction: (CallAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scroll = rememberScrollState()
    val report = LocalCallChromeInteraction.current
    var scrolling by remember { mutableStateOf(false) }
    LaunchedEffect(scroll) {
        snapshotFlow { scroll.isScrollInProgress }.collect { now ->
            CallChromeScrollRule.interaction(wasScrolling = scrolling, isScrolling = now)?.let { report?.invoke(it) }
            scrolling = now
        }
    }
    Column(
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = modifier.fillMaxWidth().padding(vertical = MeeshySpacing.sm),
    ) {
        if (title != null) {
            Text(
                text = title.uppercase(),
                color = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.6f),
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg).semantics { heading() },
            )
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
            verticalAlignment = Alignment.Top,
            modifier = Modifier.horizontalScroll(scroll).padding(horizontal = MeeshySpacing.sm),
        ) {
            items.forEach { item ->
                key(item.action) {
                    CallPillButton(
                        icon = item.icon,
                        kind = item.kind,
                        label = stringResource(item.labelRes),
                        caption = stringResource(item.captionRes ?: item.labelRes),
                        hint = item.hintRes?.let { stringResource(it) },
                        toggleState = if (item.isToggle) item.kind != CallPillKind.Normal else null,
                        diameter = CALL_ROW_GLYPH_DIAMETER,
                        onClick = { onAction(item.action) },
                        modifier = Modifier.width(CALL_ROW_CELL_WIDTH),
                    )
                }
            }
        }
    }
}
