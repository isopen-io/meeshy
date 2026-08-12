package me.meeshy.app.profile

import android.content.Intent
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.graphics.createBitmap
import androidx.core.graphics.set
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import me.meeshy.feature.profile.R
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Bottom sheet that lets the user share a profile: a scannable QR of the canonical
 * web link, plus "copy link" and a system share-chooser (message / email / any
 * app). The links come from [ProfileSharePresentation] so QR, clipboard and the
 * shared text can never disagree. Pure glue over the tested [ProfileShareBuilder].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ProfileShareSheet(
    share: ProfileSharePresentation,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val context = LocalContext.current
    val clipboard: ClipboardManager = LocalClipboardManager.current
    val shareMessage = stringResource(R.string.profile_share_message, share.displayName, share.webLink)
    // The QR always sits on a fixed-white card, so the modules must be black in
    // both themes — a theme-tinted (light-in-dark-mode) module colour would be
    // unscannable on white.
    val qr = remember(share.webLink) { qrBitmap(share.webLink, Color.Black.toArgb()) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.xl)
                .padding(bottom = MeeshySpacing.xxl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            Text(
                text = stringResource(R.string.profile_share_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            if (qr != null) {
                Surface(color = Color.White, shape = RoundedCornerShape(16.dp)) {
                    Image(
                        bitmap = qr,
                        contentDescription = stringResource(R.string.profile_share_qr_cd, share.handle),
                        modifier = Modifier
                            .padding(MeeshySpacing.lg)
                            .size(220.dp)
                            .clip(RoundedCornerShape(8.dp)),
                    )
                }
            }
            Text(text = share.handle, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            Text(
                text = share.webLink,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                OutlinedButton(
                    onClick = { clipboard.setText(AnnotatedString(share.webLink)) },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(18.dp))
                    Text(
                        text = stringResource(R.string.profile_share_copy),
                        modifier = Modifier.padding(start = MeeshySpacing.sm),
                    )
                }
                OutlinedButton(
                    onClick = {
                        val intent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, shareMessage)
                        }
                        context.startActivity(
                            Intent.createChooser(intent, context.getString(R.string.profile_share_via)),
                        )
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                    Text(
                        text = stringResource(R.string.profile_share_send),
                        modifier = Modifier.padding(start = MeeshySpacing.sm),
                    )
                }
            }
        }
    }
}

/**
 * Encode [content] as a QR [ImageBitmap] in [darkColor] on transparent, or `null`
 * if the encoder rejects the input. Rendering only — the payload it draws is the
 * tested [ProfileShareLink] output.
 */
private fun qrBitmap(content: String, darkColor: Int, size: Int = 512): ImageBitmap? =
    runCatching {
        val hints = mapOf(
            EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
            EncodeHintType.MARGIN to 1,
        )
        val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, size, size, hints)
        val transparent = Color.Transparent.toArgb()
        val bitmap = createBitmap(matrix.width, matrix.height)
        for (x in 0 until matrix.width) {
            for (y in 0 until matrix.height) {
                bitmap[x, y] = if (matrix[x, y]) darkColor else transparent
            }
        }
        bitmap.asImageBitmap()
    }.getOrNull()
