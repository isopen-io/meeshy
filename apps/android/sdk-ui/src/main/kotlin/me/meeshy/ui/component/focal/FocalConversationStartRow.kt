package me.meeshy.ui.component.focal

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * « Début de la conversation avec <nom> » (iOS `FocalConversationStartRow`) : le marqueur plat, centré,
 * sans bulle ni capsule, posé en tête du fil. [firstMessageDayLabel] est formaté PAR L'HÔTE (même
 * source que les séparateurs de jour) ; nul, le nom seul. Une rangée = un élément TalkBack.
 */
@Composable
public fun FocalConversationStartRow(
    conversationName: String,
    modifier: Modifier = Modifier,
    firstMessageDayLabel: String? = null,
) {
    val muted = MeeshyTheme.tokens.textMuted
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.lg, horizontal = FocalMetrics.Row.PADDING_HORIZONTAL.toFloat().dp)
            .semantics(mergeDescendants = true) {},
    ) {
        Icon(
            imageVector = MeeshyIcons.Forum,
            contentDescription = null,
            tint = muted,
            modifier = Modifier.size(24.dp),
        )
        Text(
            text = stringResource(R.string.focal_row_conversationStart, conversationName),
            fontSize = 12.5.sp,
            fontWeight = FontWeight.Medium,
            color = muted,
            textAlign = TextAlign.Center,
        )
        if (firstMessageDayLabel != null) {
            Text(
                text = firstMessageDayLabel,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = muted.copy(alpha = 0.8f),
                textAlign = TextAlign.Center,
            )
        }
    }
}
