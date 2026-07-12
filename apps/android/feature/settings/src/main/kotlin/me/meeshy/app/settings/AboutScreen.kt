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
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Public
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.about.AboutFeatureKey
import me.meeshy.sdk.model.about.AboutInfoKey
import me.meeshy.sdk.model.about.AboutLink
import me.meeshy.sdk.model.about.AboutLinkKind
import me.meeshy.sdk.model.about.AboutParams
import me.meeshy.sdk.model.about.AboutPresentationBuilder
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * About screen (feature-parity §L) — the Android port of the iOS `AboutView`. Pure Compose glue over
 * the tested [AboutPresentationBuilder]: reads the version/platform facts from `PackageInfo`/`Build`,
 * renders the app header, information rows, description, features and launchable links. Every decision
 * (version formatting, blank-safe fallbacks, link launchability) is made in the pure builder.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AboutScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val presentation = remember {
        val pkg: PackageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        val versionCode =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) pkg.longVersionCode
            else @Suppress("DEPRECATION") pkg.versionCode.toLong()
        AboutPresentationBuilder.build(
            AboutParams(
                versionName = pkg.versionName.orEmpty(),
                versionCode = versionCode,
                osRelease = Build.VERSION.RELEASE.orEmpty(),
                applicationId = context.packageName,
                sdkVersion = AboutPresentationBuilder.DEFAULT_SDK_VERSION,
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
                    title = { Text(stringResource(R.string.about_title)) },
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
                AppHeader(versionLabel = presentation.versionLabel)

                SectionCard(title = stringResource(R.string.about_section_informations)) {
                    presentation.infoRows.forEachIndexed { index, row ->
                        if (index > 0) Spacer(Modifier.height(MeeshySpacing.sm))
                        InfoRow(label = stringResource(row.key.labelRes()), value = row.value)
                    }
                }

                SectionCard(title = stringResource(R.string.about_section_description)) {
                    Text(
                        text = stringResource(R.string.about_description_body),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MeeshyTheme.tokens.textPrimary,
                    )
                }

                SectionCard(title = stringResource(R.string.about_section_features)) {
                    presentation.features.forEachIndexed { index, feature ->
                        if (index > 0) Spacer(Modifier.height(MeeshySpacing.sm))
                        FeatureRow(icon = feature.icon(), label = stringResource(feature.labelRes()))
                    }
                }

                SectionCard(title = stringResource(R.string.about_section_links)) {
                    presentation.links.forEachIndexed { index, link ->
                        if (index > 0) Spacer(Modifier.height(MeeshySpacing.sm))
                        LinkRow(link = link, label = stringResource(link.kind.labelRes()))
                    }
                }

                Text(
                    text = stringResource(R.string.about_copyright),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textMuted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
}

@Composable
private fun AppHeader(versionLabel: String) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .background(
                    Brush.linearGradient(listOf(MeeshyPalette.Indigo500, MeeshyPalette.Indigo700)),
                    RoundedCornerShape(24.dp),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Public,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(40.dp),
            )
        }
        Text(
            text = stringResource(R.string.about_app_name),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.about_version_label, versionLabel),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textMuted,
        )
    }
}

@Composable
private fun SectionCard(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            text = title.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyPalette.Indigo500,
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(MeeshyTheme.tokens.backgroundSecondary, RoundedCornerShape(MeeshySpacing.md))
                .border(
                    1.dp,
                    MeeshyPalette.Indigo500.copy(alpha = 0.15f),
                    RoundedCornerShape(MeeshySpacing.md),
                )
                .padding(MeeshySpacing.lg),
        ) {
            content()
        }
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

@Composable
private fun FeatureRow(icon: ImageVector, label: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(20.dp))
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
        Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun LinkRow(link: AboutLink, label: String) {
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
        Icon(
            link.kind.icon(),
            contentDescription = null,
            tint = MeeshyPalette.Info,
            modifier = Modifier.size(20.dp),
        )
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
        Spacer(Modifier.weight(1f))
        Icon(
            Icons.AutoMirrored.Filled.OpenInNew,
            contentDescription = null,
            tint = MeeshyPalette.Info,
            modifier = Modifier.size(16.dp),
        )
    }
}

private fun AboutInfoKey.labelRes(): Int = when (this) {
    AboutInfoKey.PLATFORM -> R.string.about_info_platform
    AboutInfoKey.APPLICATION_ID -> R.string.about_info_application_id
    AboutInfoKey.SDK_VERSION -> R.string.about_info_sdk_version
}

private fun AboutFeatureKey.labelRes(): Int = when (this) {
    AboutFeatureKey.ENCRYPTION -> R.string.about_feature_encryption
    AboutFeatureKey.TRANSLATION -> R.string.about_feature_translation
    AboutFeatureKey.VOICE_CLONING -> R.string.about_feature_voice_cloning
    AboutFeatureKey.THEMES -> R.string.about_feature_themes
    AboutFeatureKey.CLOUD_SYNC -> R.string.about_feature_cloud_sync
}

private fun AboutFeatureKey.icon(): ImageVector = when (this) {
    AboutFeatureKey.ENCRYPTION -> Icons.Filled.Lock
    AboutFeatureKey.TRANSLATION -> Icons.Filled.Language
    AboutFeatureKey.VOICE_CLONING -> Icons.Filled.GraphicEq
    AboutFeatureKey.THEMES -> Icons.Filled.Palette
    AboutFeatureKey.CLOUD_SYNC -> Icons.Filled.Cloud
}

private fun AboutLinkKind.labelRes(): Int = when (this) {
    AboutLinkKind.WEBSITE -> R.string.about_link_website
    AboutLinkKind.TWITTER -> R.string.about_link_twitter
    AboutLinkKind.GITHUB -> R.string.about_link_github
}

private fun AboutLinkKind.icon(): ImageVector = when (this) {
    AboutLinkKind.WEBSITE -> Icons.Filled.Public
    AboutLinkKind.TWITTER -> Icons.Filled.Language
    AboutLinkKind.GITHUB -> Icons.Filled.Code
}
