package me.meeshy.app.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.legal.LegalDocumentCatalog
import me.meeshy.sdk.model.legal.LegalDocumentKind
import me.meeshy.sdk.model.legal.LegalSectionKey
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Legal document screen (feature-parity §L) — the Android port of the iOS `TermsOfServiceView` and
 * `PrivacyPolicyView`, unified into one data-driven screen keyed by [LegalDocumentKind]. Pure
 * Compose glue over the tested [LegalDocumentCatalog]: renders the "last updated" line and the
 * numbered section cards (heading + body), each section resolved to a localized string. Unlike iOS's
 * manual fr/en picker, the document follows the app's language automatically across values-* (Prisme
 * philosophy — content in the user's language, no friction).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LegalDocumentScreen(kind: LegalDocumentKind, onBack: () -> Unit) {
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
                    title = { Text(stringResource(kind.titleRes())) },
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
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                Text(
                    text = stringResource(kind.lastUpdatedRes()),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textMuted,
                    modifier = Modifier.fillMaxWidth(),
                )

                LegalDocumentCatalog.numbered(kind).forEach { section ->
                    LegalSectionCard(
                        number = section.number,
                        title = stringResource(section.key.titleRes()),
                        body = stringResource(section.key.bodyRes()),
                    )
                }

                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
}

@Composable
private fun LegalSectionCard(number: Int, title: String, body: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MeeshyTheme.tokens.backgroundSecondary, RoundedCornerShape(MeeshySpacing.md))
            .border(
                1.dp,
                MeeshyPalette.Info.copy(alpha = 0.15f),
                RoundedCornerShape(MeeshySpacing.md),
            )
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .background(MeeshyPalette.Info, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = number.toString(),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
            }
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
            )
        }
        Text(
            text = body,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

private fun LegalDocumentKind.titleRes(): Int = when (this) {
    LegalDocumentKind.TERMS_OF_SERVICE -> R.string.legal_terms_title
    LegalDocumentKind.PRIVACY_POLICY -> R.string.legal_privacy_title
}

private fun LegalDocumentKind.lastUpdatedRes(): Int = when (this) {
    LegalDocumentKind.TERMS_OF_SERVICE -> R.string.legal_terms_last_updated
    LegalDocumentKind.PRIVACY_POLICY -> R.string.legal_privacy_last_updated
}

private fun LegalSectionKey.titleRes(): Int = when (this) {
    LegalSectionKey.TOS_ACCEPTANCE -> R.string.legal_tos_acceptance_title
    LegalSectionKey.TOS_LICENSE -> R.string.legal_tos_license_title
    LegalSectionKey.TOS_USER_CONDUCT -> R.string.legal_tos_user_conduct_title
    LegalSectionKey.TOS_CONTENT -> R.string.legal_tos_content_title
    LegalSectionKey.TOS_ACCOUNT_TERMINATION -> R.string.legal_tos_account_termination_title
    LegalSectionKey.TOS_DISCLAIMER -> R.string.legal_tos_disclaimer_title
    LegalSectionKey.TOS_LIABILITY -> R.string.legal_tos_liability_title
    LegalSectionKey.TOS_CHANGES -> R.string.legal_tos_changes_title
    LegalSectionKey.TOS_CONTACT -> R.string.legal_tos_contact_title
    LegalSectionKey.PRIVACY_COLLECTION -> R.string.legal_privacy_collection_title
    LegalSectionKey.PRIVACY_USE -> R.string.legal_privacy_use_title
    LegalSectionKey.PRIVACY_SECURITY -> R.string.legal_privacy_security_title
    LegalSectionKey.PRIVACY_RETENTION -> R.string.legal_privacy_retention_title
    LegalSectionKey.PRIVACY_RIGHTS -> R.string.legal_privacy_rights_title
    LegalSectionKey.PRIVACY_CHANGES -> R.string.legal_privacy_changes_title
    LegalSectionKey.PRIVACY_CONTACT -> R.string.legal_privacy_contact_title
}

private fun LegalSectionKey.bodyRes(): Int = when (this) {
    LegalSectionKey.TOS_ACCEPTANCE -> R.string.legal_tos_acceptance_body
    LegalSectionKey.TOS_LICENSE -> R.string.legal_tos_license_body
    LegalSectionKey.TOS_USER_CONDUCT -> R.string.legal_tos_user_conduct_body
    LegalSectionKey.TOS_CONTENT -> R.string.legal_tos_content_body
    LegalSectionKey.TOS_ACCOUNT_TERMINATION -> R.string.legal_tos_account_termination_body
    LegalSectionKey.TOS_DISCLAIMER -> R.string.legal_tos_disclaimer_body
    LegalSectionKey.TOS_LIABILITY -> R.string.legal_tos_liability_body
    LegalSectionKey.TOS_CHANGES -> R.string.legal_tos_changes_body
    LegalSectionKey.TOS_CONTACT -> R.string.legal_tos_contact_body
    LegalSectionKey.PRIVACY_COLLECTION -> R.string.legal_privacy_collection_body
    LegalSectionKey.PRIVACY_USE -> R.string.legal_privacy_use_body
    LegalSectionKey.PRIVACY_SECURITY -> R.string.legal_privacy_security_body
    LegalSectionKey.PRIVACY_RETENTION -> R.string.legal_privacy_retention_body
    LegalSectionKey.PRIVACY_RIGHTS -> R.string.legal_privacy_rights_body
    LegalSectionKey.PRIVACY_CHANGES -> R.string.legal_privacy_changes_body
    LegalSectionKey.PRIVACY_CONTACT -> R.string.legal_privacy_contact_body
}
