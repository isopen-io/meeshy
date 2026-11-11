package me.meeshy.app.calls

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import me.meeshy.feature.calls.R
import me.meeshy.ui.theme.MeeshySpacing

/** A panel drawn INSIDE the pill: a header (back to the actions, centred title, close) over its content. */
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
            PanelHeaderButton(MeeshyIcons.Back, stringResource(R.string.call_panel_back), onBack)
            Text(
                text = title,
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            CallPanelCloseButton(onClose)
        }
        content()
    }
}

/** The « Close » of a panel drawn in the pill (a 48 dp glass disc): the reaction and recording panels share it (the journal has none: « Journal » on the left, the switch on the right, plate P6). */
@Composable
internal fun CallPanelCloseButton(onClose: () -> Unit) {
    PanelHeaderButton(MeeshyIcons.Close, stringResource(R.string.call_panel_close), onClose)
}

/** G3.6 — the header buttons carry the glass of every call button (#17323): the pill button, without a caption. */
@Composable
private fun PanelHeaderButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    CallPillButton(icon = icon, kind = CallPillKind.Normal, label = label, onClick = onClick)
}
