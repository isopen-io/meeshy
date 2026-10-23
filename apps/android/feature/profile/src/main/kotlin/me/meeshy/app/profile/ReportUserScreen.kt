package me.meeshy.app.profile

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Notes
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.report.ReportReasonPresentation
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.report.ReportDetailsField
import me.meeshy.ui.component.report.ReportReasonList
import me.meeshy.ui.component.settings.SettingsCard
import me.meeshy.ui.component.settings.SettingsSectionHeader
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Feuille « Signaler @utilisateur » — port de `ReportUserView` (iOS) bâti sur les briques
 * partagées de `:sdk-ui` : motifs illustrés, détails plafonnés à 500 caractères avec compteur.
 * Haptique lourd à l'envoi, toast puis fermeture au succès, erreur en ligne sinon.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportUserScreen(
    onDone: () -> Unit,
    viewModel: ReportUserViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    val context = LocalContext.current
    val sentMessage = stringResource(R.string.report_user_success)
    val tokens = MeeshyTheme.tokens

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                ReportUserEffect.ShowSentToast -> {
                    haptics.success()
                    Toast.makeText(context, sentMessage, Toast.LENGTH_SHORT).show()
                }
                ReportUserEffect.Close -> onDone()
            }
        }
    }
    LaunchedEffect(state.hasError) {
        if (state.hasError) haptics.error()
    }

    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = tokens.textPrimary,
                        actionIconContentColor = tokens.textMuted,
                    ),
                    title = {
                        Text(
                            if (viewModel.username.isBlank()) {
                                stringResource(R.string.report_title_generic)
                            } else {
                                stringResource(R.string.report_title, viewModel.username)
                            },
                        )
                    },
                    actions = {
                        IconButton(onClick = {
                            haptics.light()
                            onDone()
                        }) {
                            Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.report_close))
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
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                    SettingsSectionHeader(
                        title = stringResource(R.string.report_reason_header),
                        icon = Icons.Filled.ErrorOutline,
                        color = tokens.warning,
                    )
                    SettingsCard(tint = tokens.warning) {
                        ReportReasonList(
                            reasons = state.reasons.map { ReportReasonPresentation.of(it) },
                            selected = state.selectedReason,
                            onSelect = {
                                haptics.light()
                                viewModel.selectReason(it)
                            },
                            label = { stringResource(reasonLabel(it.reason)) },
                            separatorTint = tokens.warning,
                        )
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                    SettingsSectionHeader(
                        title = stringResource(R.string.report_details_header),
                        icon = Icons.Filled.Notes,
                        color = tokens.info,
                    )
                    ReportDetailsField(
                        value = state.details,
                        onValueChange = viewModel::onDetailsChange,
                        placeholder = stringResource(R.string.report_details_placeholder),
                        accessibilityLabel = stringResource(R.string.report_user_details_a11y),
                    )
                }

                val hint = "${stringResource(R.string.report_user_submit_hint)} ${viewModel.username}".trim()
                Button(
                    onClick = {
                        haptics.heavy()
                        viewModel.submit()
                    },
                    enabled = state.canSubmit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = hint },
                    colors = ButtonDefaults.buttonColors(containerColor = tokens.error),
                ) {
                    if (state.isSubmitting) {
                        CircularProgressIndicator(
                            modifier = Modifier.padding(end = MeeshySpacing.sm),
                            strokeWidth = 2.dp,
                            color = Color.White,
                        )
                    }
                    Text(stringResource(R.string.report_submit))
                }

                if (state.hasError) {
                    Text(
                        stringResource(R.string.report_error),
                        color = tokens.error,
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

private fun reasonLabel(reason: ReportReason): Int = when (reason) {
    ReportReason.SPAM -> R.string.report_reason_spam
    ReportReason.HARASSMENT -> R.string.report_reason_harassment
    ReportReason.INAPPROPRIATE -> R.string.report_reason_inappropriate
    ReportReason.IMPERSONATION -> R.string.report_reason_impersonation
    ReportReason.OTHER, ReportReason.VIOLENCE, ReportReason.HATE_SPEECH -> R.string.report_reason_other
}
