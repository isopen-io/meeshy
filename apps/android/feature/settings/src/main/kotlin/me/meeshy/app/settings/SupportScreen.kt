package me.meeshy.app.settings

import android.content.Intent
import android.content.pm.PackageInfo
import android.net.Uri
import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.support.SupportInfoKey
import me.meeshy.sdk.model.support.SupportInfoRow
import me.meeshy.sdk.model.support.SupportLink
import me.meeshy.sdk.model.support.SupportLinkKind
import me.meeshy.sdk.model.support.SupportLinkSection
import me.meeshy.sdk.model.support.SupportParams
import me.meeshy.sdk.model.support.SupportPresentationBuilder
import me.meeshy.sdk.model.support.SupportSectionKey
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Help & Support screen (feature-parity §L) — the Android port of the iOS `SupportView`. Pure Compose
 * glue over the tested [SupportPresentationBuilder]: reads the version/build/platform facts from
 * `PackageInfo`/`Build`, then renders the accent-coded Get-help / Contact-us / Report-a-problem link
 * sections and the read-only Information rows. Every decision (link launchability, blank-safe version
 * / build / platform fallbacks, section ordering) is made in the pure builder.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupportScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val presentation = remember {
        val pkg: PackageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        val versionCode =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) pkg.longVersionCode
            else @Suppress("DEPRECATION") pkg.versionCode.toLong()
        SupportPresentationBuilder.build(
            SupportParams(
                versionName = pkg.versionName.orEmpty(),
                versionCode = versionCode,
                osRelease = Build.VERSION.RELEASE.orEmpty(),
            ),
        )
    }

    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                        navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = { Text(stringResource(R.string.support_title)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.settings_back),
                            )
                        }
                    },
                )
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                presentation.linkSections.forEach { section ->
                    LinkSectionCard(section)
                }

                InfoSectionCard(presentation.infoRows)

                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
}

@Composable
private fun LinkSectionCard(section: SupportLinkSection) {
    val accent = section.key.accent()
    SectionCard(title = stringResource(section.key.titleRes()), accent = accent) {
        section.links.forEachIndexed { index, link ->
            if (index > 0) Spacer(Modifier.height(MeeshySpacing.sm))
            LinkRow(link = link, label = stringResource(link.kind.labelRes()), accent = accent)
        }
    }
}

@Composable
private fun InfoSectionCard(rows: List<SupportInfoRow>) {
    SectionCard(
        title = stringResource(R.string.support_section_info),
        accent = MeeshyPalette.Neutral500,
    ) {
        rows.forEachIndexed { index, row ->
            if (index > 0) Spacer(Modifier.height(MeeshySpacing.sm))
            InfoRow(label = stringResource(row.key.labelRes()), value = row.value)
        }
    }
}

@Composable
private fun SectionCard(title: String, accent: Color, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            text = title.uppercase(),
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
        ) {
            content()
        }
    }
}

@Composable
private fun LinkRow(link: SupportLink, label: String, accent: Color) {
    val context = LocalContext.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link.url)))
            },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(link.kind.icon(), contentDescription = null, tint = accent, modifier = Modifier.size(20.dp))
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
        Spacer(Modifier.weight(1f))
        Icon(
            Icons.AutoMirrored.Filled.OpenInNew,
            contentDescription = null,
            tint = accent,
            modifier = Modifier.size(16.dp),
        )
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
        Text(value, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted)
    }
}

private fun SupportSectionKey.titleRes(): Int = when (this) {
    SupportSectionKey.HELP -> R.string.support_section_help
    SupportSectionKey.CONTACT -> R.string.support_section_contact
    SupportSectionKey.REPORT -> R.string.support_section_report
    SupportSectionKey.INFO -> R.string.support_section_info
}

private fun SupportSectionKey.accent(): Color = when (this) {
    SupportSectionKey.HELP -> MeeshyPalette.Success
    SupportSectionKey.CONTACT -> MeeshyPalette.Info
    SupportSectionKey.REPORT -> MeeshyPalette.Warning
    SupportSectionKey.INFO -> MeeshyPalette.Neutral500
}

private fun SupportLinkKind.labelRes(): Int = when (this) {
    SupportLinkKind.HELP_CENTER -> R.string.support_link_help_center
    SupportLinkKind.FAQ -> R.string.support_link_faq
    SupportLinkKind.EMAIL -> R.string.support_link_email
    SupportLinkKind.TWITTER -> R.string.support_link_twitter
    SupportLinkKind.BUG_REPORT -> R.string.support_link_bug
    SupportLinkKind.FEATURE_REQUEST -> R.string.support_link_feature
}

private fun SupportLinkKind.icon(): ImageVector = when (this) {
    SupportLinkKind.HELP_CENTER -> Icons.Filled.MenuBook
    SupportLinkKind.FAQ -> Icons.AutoMirrored.Filled.HelpOutline
    SupportLinkKind.EMAIL -> Icons.Filled.Email
    SupportLinkKind.TWITTER -> Icons.Filled.AlternateEmail
    SupportLinkKind.BUG_REPORT -> Icons.Filled.BugReport
    SupportLinkKind.FEATURE_REQUEST -> Icons.Filled.Lightbulb
}

private fun SupportInfoKey.labelRes(): Int = when (this) {
    SupportInfoKey.VERSION -> R.string.support_info_version
    SupportInfoKey.BUILD -> R.string.support_info_build
    SupportInfoKey.PLATFORM -> R.string.support_info_platform
}
