package me.meeshy.app.settings

import android.content.Context
import androidx.annotation.RawRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.licenses.LibsignalNotices
import me.meeshy.sdk.model.licenses.LicenseNotice
import me.meeshy.sdk.model.licenses.MeeshySourceOffer
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.leadingNavigationIcon
import me.meeshy.ui.component.chrome.leadingNavigationLabel
import me.meeshy.ui.component.link.openExternalLink
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * What the AGPL-3.0 asks of the licenses screen when the APK embeds libsignal (#14628): Meeshy's
 * license (MIT sources, AGPL-3.0 app), the source offer at the build's commit, the full license
 * text and libsignal's notices — all bundled as raw resources, never fetched. Mirror of the iOS
 * `LicensesAGPLSection` / `LicensesLibsignalSection`.
 *
 * Whether libsignal is linked is read at runtime ([LibsignalNotices.PROBE_CLASS]): without it the
 * app is MIT only and the screen says so, without the AGPL text or libsignal notices.
 *
 * Compliance engineering, not legal advice: the final wording awaits the project's lawyer (#11548).
 */
internal fun isLibsignalLinked(): Boolean = runCatching { Class.forName(LibsignalNotices.PROBE_CLASS) }.isSuccess

private suspend fun Context.readRaw(@RawRes id: Int): String = withContext(Dispatchers.IO) {
    resources.openRawResource(id).bufferedReader(Charsets.UTF_8).use { it.readText() }
}

@Composable
internal fun MeeshyLicenseSection(
    offer: MeeshySourceOffer,
    libsignalLinked: Boolean,
    onOpenNotice: (LicenseNotice) -> Unit,
) {
    val context = LocalContext.current
    val accent = MeeshyPalette.Info
    val agplTitle = stringResource(R.string.licenses_agpl_title)
    val agplText by produceState<String?>(initialValue = null, libsignalLinked) {
        value = if (libsignalLinked) context.readRaw(R.raw.agpl_3_0) else null
    }
    LicenseSection(title = stringResource(R.string.licenses_meeshy_title), accent = accent) {
        Text(
            text = stringResource(if (libsignalLinked) R.string.licenses_meeshy_body else R.string.licenses_meeshy_body_mit),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        SourceRow(offer = offer, accent = accent)
        agplText?.let { text ->
            ChevronRow(label = agplTitle, accent = accent) { onOpenNotice(LicenseNotice(agplTitle, text)) }
        }
    }
}

@Composable
private fun SourceRow(offer: MeeshySourceOffer, accent: Color) {
    val context = LocalContext.current
    val openLabel = stringResource(R.string.licenses_source_open)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(onClickLabel = openLabel) { context.openExternalLink(offer.url) },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                stringResource(R.string.licenses_source_title),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                stringResource(R.string.licenses_source_body),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
            )
            offer.shortCommit?.let { short ->
                Text(
                    stringResource(R.string.licenses_source_commit, short),
                    style = MaterialTheme.typography.labelSmall,
                    fontFamily = FontFamily.Monospace,
                    color = MeeshyTheme.tokens.textMuted,
                )
            }
        }
        Icon(MeeshyIcons.OpenExternal, contentDescription = null, tint = accent, modifier = Modifier.size(16.dp))
    }
}

@Composable
internal fun LibsignalNoticesSection(onOpenNotice: (LicenseNotice) -> Unit) {
    val context = LocalContext.current
    val accent = MeeshyPalette.Info
    val notices by produceState(initialValue = emptyList<LicenseNotice>()) {
        val markdown = context.readRaw(R.raw.libsignal_acknowledgments)
        value = withContext(Dispatchers.Default) { LibsignalNotices.parse(markdown) }
    }
    if (notices.isEmpty()) return
    LicenseSection(title = stringResource(R.string.licenses_libsignal_title), accent = accent) {
        Text(
            stringResource(R.string.licenses_libsignal_body),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textMuted,
        )
        notices.forEach { notice ->
            ChevronRow(label = notice.title, accent = accent) { onOpenNotice(notice) }
        }
    }
}

@Composable
private fun LicenseSection(title: String, accent: Color, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            text = title.uppercase(),
            modifier = Modifier.semantics { heading() },
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = accent,
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(MeeshyTheme.tokens.backgroundSecondary, RoundedCornerShape(MeeshySpacing.md))
                .border(1.dp, accent.copy(alpha = 0.15f), RoundedCornerShape(MeeshySpacing.md))
                .padding(MeeshySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) { content() }
    }
}

@Composable
private fun ChevronRow(label: String, accent: Color, onClick: () -> Unit) {
    val hint = stringResource(R.string.licenses_text_hint)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(onClickLabel = hint, onClick = onClick),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 3,
        )
        Icon(MeeshyIcons.ChevronForward, contentDescription = null, tint = accent, modifier = Modifier.size(20.dp))
    }
}

/** The full text of a bundled license, readable offline, kept left-to-right like the official text. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun LicenseTextDialog(notice: LicenseNotice, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        MeeshyBackground {
            Scaffold(
                containerColor = Color.Transparent,
                topBar = {
                    TopAppBar(
                        colors = TopAppBarDefaults.topAppBarColors(
                            containerColor = Color.Transparent,
                            titleContentColor = MeeshyTheme.tokens.textPrimary,
                            navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                        ),
                        title = { Text(notice.title, maxLines = 1) },
                        navigationIcon = {
                            IconButton(onClick = onDismiss) {
                                Icon(
                                    leadingNavigationIcon(),
                                    contentDescription = leadingNavigationLabel(stringResource(R.string.settings_back)),
                                )
                            }
                        },
                    )
                },
            ) { padding ->
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Text(
                        text = notice.text,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(padding)
                            .verticalScroll(rememberScrollState())
                            .horizontalScroll(rememberScrollState())
                            .padding(MeeshySpacing.lg),
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = MeeshyTheme.tokens.textPrimary,
                    )
                }
            }
        }
    }
}
