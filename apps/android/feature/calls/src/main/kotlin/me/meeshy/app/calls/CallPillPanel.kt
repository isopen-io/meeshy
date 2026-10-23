package me.meeshy.app.calls

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.calls.R
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshySpacing

/** A panel drawn INSIDE the pill: a header (back to the actions, title, close) over its content. */
@Composable
internal fun CallPillPanel(
    title: String,
    onBack: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Column(modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xs),
        ) {
            PanelHeaderButton(onBack) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.call_panel_back),
                    tint = MeeshyMediaChromeColors.OnMediaSecondary,
                    modifier = Modifier.size(20.dp),
                )
            }
            Text(
                text = title,
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            PanelHeaderButton(onClose) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = stringResource(R.string.call_panel_close),
                    tint = MeeshyMediaChromeColors.OnMediaSecondary,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
        content()
    }
}

@Composable
private fun RowScope.PanelHeaderButton(onClick: () -> Unit, icon: @Composable () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.size(48.dp)) { icon() }
}
