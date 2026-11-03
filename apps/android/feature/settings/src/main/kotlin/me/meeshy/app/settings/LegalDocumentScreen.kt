package me.meeshy.app.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import android.content.Context
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.util.Locale
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.legal.LegalDocumentCatalog
import me.meeshy.sdk.model.legal.LegalDocumentKind
import me.meeshy.sdk.model.legal.LegalDocumentLanguage
import me.meeshy.sdk.model.legal.LegalSectionKey
import me.meeshy.ui.component.chrome.CollapsibleHeaderPage
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Legal document screen - the Android port of the iOS `TermsOfServiceView` / `PrivacyPolicyView`,
 * unified into one data-driven screen keyed by [LegalDocumentKind]. A collapsing header page, a
 * segmented language picker (the document opens in the first delivered language of the reader's
 * Prisme and switches without leaving the screen), the "last updated" mention and the numbered
 * section cards - all read in the DOCUMENT language, not the app one.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LegalDocumentScreen(
    kind: LegalDocumentKind,
    onBack: () -> Unit,
    viewModel: LegalDocumentViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val documentContext = rememberLocalizedContext(state.language)
    val document = remember(kind, state.language) { LegalDocumentCatalog.document(kind, state.language) }

    MeeshyBackground {
        CollapsibleHeaderPage(
            title = stringResource(kind.titleRes()),
            onBack = onBack,
            titleColor = MeeshyTheme.tokens.textPrimary,
            backArrowColor = MeeshyPalette.Indigo500,
            backgroundColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                LanguagePicker(
                    selected = state.language,
                    onSelect = { viewModel.onEvent(LegalDocumentUiEvent.SelectLanguage(it)) },
                )
                Text(
                    text = documentContext.getString(R.string.legal_last_updated),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Medium,
                    color = MeeshyTheme.tokens.textMuted,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = MeeshySpacing.xs),
                )
                document.sections.forEach { section ->
                    LegalSectionCard(
                        number = section.number,
                        title = documentContext.getString(section.key.titleRes()),
                        body = documentContext.getString(section.key.bodyRes()),
                    )
                }
                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LanguagePicker(selected: LegalDocumentLanguage, onSelect: (LegalDocumentLanguage) -> Unit) {
    val label = stringResource(R.string.legal_language_picker_a11y)
    val appLocale = LocalConfiguration.current.locales[0]
    val languages = LegalDocumentCatalog.languages
    SingleChoiceSegmentedButtonRow(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = label },
    ) {
        languages.forEachIndexed { index, language ->
            SegmentedButton(
                selected = language == selected,
                onClick = { onSelect(language) },
                shape = SegmentedButtonDefaults.itemShape(index = index, count = languages.size),
            ) {
                Text(
                    Locale(language.code).getDisplayLanguage(appLocale)
                        .replaceFirstChar { it.titlecase(appLocale) },
                    maxLines = 1,
                )
            }
        }
    }
}

/** A context whose resources resolve in [language], so a document is read in its own language. */
@Composable
private fun rememberLocalizedContext(language: LegalDocumentLanguage): Context {
    val base = LocalContext.current
    val configuration = LocalConfiguration.current
    return remember(base, configuration, language) {
        val localized = Configuration(configuration).apply { setLocale(Locale(language.code)) }
        base.createConfigurationContext(localized)
    }
}

@Composable
private fun LegalSectionCard(number: Int, title: String, body: String) {
    val accent = MeeshyPalette.Indigo500
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MeeshyTheme.tokens.backgroundSecondary, shape)
            .border(1.dp, accent.copy(alpha = 0.15f), shape)
            .padding(MeeshySpacing.lg)
            .semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .background(accent, CircleShape),
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
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
            )
        }
        Text(
            text = body,
            style = MaterialTheme.typography.bodyMedium.copy(lineHeight = 22.sp),
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

private fun LegalDocumentKind.titleRes(): Int = when (this) {
    LegalDocumentKind.TERMS_OF_SERVICE -> R.string.legal_terms_title
    LegalDocumentKind.PRIVACY_POLICY -> R.string.legal_privacy_title
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
