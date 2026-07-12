package me.meeshy.app.settings

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.licenses.OpenSourceLicense
import me.meeshy.sdk.model.licenses.OpenSourceLicenseCatalog
import me.meeshy.sdk.model.licenses.OpenSourceLicenseGroup
import me.meeshy.sdk.model.licenses.OpenSourceLicenseType
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Open-source licenses screen (feature-parity §L) — the Android port of the iOS `LicensesView`, but
 * over the Android-accurate dependency catalog. Pure Compose glue over the tested
 * [OpenSourceLicenseCatalog]/`OpenSourceLicensePresentationBuilder`: renders one accent-coded section
 * per license family (grouped + sorted in the pure builder — surpassing iOS's flat list), each row a
 * tappable card that opens the repository. Every decision (launchability, grouping, ordering) is made
 * in the pure core; this file only maps types → localized labels / accent colours and fires the intent.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LicensesScreen(onBack: () -> Unit) {
    val groups = remember { OpenSourceLicenseCatalog.groups() }

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
                    title = { Text(stringResource(R.string.licenses_title)) },
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
                Text(
                    text = stringResource(R.string.licenses_intro),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textMuted,
                )

                groups.forEach { group ->
                    LicenseGroupCard(group)
                }

                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
}

@Composable
private fun LicenseGroupCard(group: OpenSourceLicenseGroup) {
    val accent = group.type.accent()
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            text = stringResource(group.type.labelRes()).uppercase(),
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
        ) {
            group.licenses.forEach { license ->
                LicenseRow(license = license, accent = accent)
            }
        }
    }
}

@Composable
private fun LicenseRow(license: OpenSourceLicense, accent: Color) {
    val context = LocalContext.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(license.url)))
            },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                license.name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Text(
                license.author,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
        Icon(
            Icons.AutoMirrored.Filled.OpenInNew,
            contentDescription = null,
            tint = accent,
            modifier = Modifier.size(16.dp),
        )
    }
}

private fun OpenSourceLicenseType.labelRes(): Int = when (this) {
    OpenSourceLicenseType.MIT -> R.string.licenses_type_mit
    OpenSourceLicenseType.APACHE_2_0 -> R.string.licenses_type_apache
    OpenSourceLicenseType.BSD -> R.string.licenses_type_bsd
    OpenSourceLicenseType.OTHER -> R.string.licenses_type_other
}

private fun OpenSourceLicenseType.accent(): Color = when (this) {
    OpenSourceLicenseType.MIT -> MeeshyPalette.Success
    OpenSourceLicenseType.APACHE_2_0 -> MeeshyPalette.Warning
    OpenSourceLicenseType.BSD -> MeeshyPalette.Info
    OpenSourceLicenseType.OTHER -> MeeshyPalette.Neutral500
}
