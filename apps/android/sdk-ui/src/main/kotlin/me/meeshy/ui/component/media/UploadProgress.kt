package me.meeshy.ui.component.media

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.LocalConfiguration
import me.meeshy.sdk.model.media.MediaUploadProgress
import me.meeshy.sdk.model.media.UploadByteReading
import me.meeshy.sdk.model.media.UploadByteUnit
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyTheme
import java.text.NumberFormat
import java.util.Locale

/** « 4,8 » and « 14,2 » for « 4,8 / 14,2 Mo »: the reader's locale, one decimal at most. */
public object UploadProgressFormat {

    public fun numbers(reading: UploadByteReading, locale: Locale): Pair<String, String> {
        val format = NumberFormat.getInstance(locale).apply {
            maximumFractionDigits = 1
            minimumFractionDigits = 0
        }
        return format.format(reading.sentScaled) to format.format(reading.totalScaled)
    }

    @StringRes
    internal fun unitRes(unit: UploadByteUnit): Int = when (unit) {
        UploadByteUnit.KILOBYTES -> R.string.sdk_upload_unit_kb
        UploadByteUnit.MEGABYTES -> R.string.sdk_upload_unit_mb
        UploadByteUnit.GIGABYTES -> R.string.sdk_upload_unit_gb
    }
}

/**
 * One media on its way out: a determinate bar and « 4,8 / 14,2 Mo » beneath it (#13429). Nothing is drawn
 * when there is no total to measure — a bar frozen at zero is worse than none.
 */
@Composable
public fun UploadProgressLine(progress: MediaUploadProgress.Uploading, modifier: Modifier = Modifier) {
    val fraction = progress.fraction ?: return
    val reading = UploadByteReading.of(progress.sent, progress.total)
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    val (sent, total) = UploadProgressFormat.numbers(reading, locale)
    val label = stringResource(R.string.sdk_upload_progress, sent, total, stringResource(UploadProgressFormat.unitRes(reading.unit)))
    val spoken = stringResource(R.string.sdk_upload_progress_a11y, reading.percent)
    Column(modifier = modifier.fillMaxWidth().semantics { contentDescription = spoken }) {
        LinearProgressIndicator(
            progress = { fraction.toFloat() },
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.primary,
            trackColor = MeeshyTheme.tokens.hairline,
        )
        Text(text = label, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted)
    }
}
