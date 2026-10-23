package me.meeshy.app.conversations

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.component.chrome.MeeshyCard
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Success sheet surfaced once the link is created: shows the shareable join URL and
 * offers Copy / Share, then Done returns the caller to the previous screen. Replaces
 * the earlier bare pop so the owner never loses the freshly minted link.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CreatedShareLinkSheet(joinUrl: String, onDone: () -> Unit) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDone,
        sheetState = sheetState,
        containerColor = MeeshyTheme.tokens.backgroundSecondary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Text(
                text = stringResource(R.string.share_link_created_title),
                style = MaterialTheme.typography.titleLarge,
                color = MeeshyTheme.tokens.textPrimary,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = stringResource(R.string.share_link_created_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
            MeeshyCard {
                Text(
                    text = joinUrl,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyPalette.Indigo400,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                OutlinedButton(
                    onClick = {
                        copyToClipboard(context, joinUrl)
                        Toast.makeText(
                            context,
                            context.getString(R.string.share_link_created_copied),
                            Toast.LENGTH_SHORT,
                        ).show()
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(
                        Icons.Filled.ContentCopy,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = stringResource(R.string.share_link_created_copy),
                        modifier = Modifier.padding(start = MeeshySpacing.xs),
                    )
                }
                OutlinedButton(
                    onClick = { shareLink(context, joinUrl) },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(
                        Icons.Filled.Share,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = stringResource(R.string.share_link_created_share),
                        modifier = Modifier.padding(start = MeeshySpacing.xs),
                    )
                }
            }
            MeeshyPrimaryButton(
                text = stringResource(R.string.share_link_created_done),
                onClick = onDone,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private fun copyToClipboard(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    clipboard?.setPrimaryClip(ClipData.newPlainText("meeshy-share-link", text))
}

private fun shareLink(context: Context, joinUrl: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, context.getString(R.string.share_link_created_share_subject))
        putExtra(Intent.EXTRA_TEXT, joinUrl)
    }
    context.startActivity(Intent.createChooser(send, null))
}
