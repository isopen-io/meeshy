package me.meeshy.app.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.session.ActiveSessionsScreenLaw.Banner
import me.meeshy.sdk.model.session.ActiveSessionsScreenLaw.Mode
import me.meeshy.sdk.model.session.SessionRowPresentation
import me.meeshy.ui.component.chrome.CollapsibleHeaderLazyPage
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.format.RelativeTimeLongText
import me.meeshy.ui.format.rememberRelativeTimeLongStrings
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.component.MeeshyInfoNote
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/**
 * Sécurité > Sessions (iOS `ActiveSessionsView`) : « Cet appareil » puis « Autres appareils », cache-first,
 * lisible hors ligne, déconnexion confirmée par le nom de l'appareil, tirer pour actualiser.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActiveSessionsScreen(
    onBack: () -> Unit,
    viewModel: ActiveSessionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val mapper = rememberActiveSessionsUiMapper()
    val haptics = rememberMeeshyHaptics()
    val scope = rememberCoroutineScope()

    LaunchedEffect(viewModel) {
        viewModel.effectFlow.collect { effect ->
            when (effect) {
                ActiveSessionsUiEffect.Success -> haptics.success()
                ActiveSessionsUiEffect.Error -> haptics.error()
            }
        }
    }

    MeeshyBackground {
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { scope.launch { viewModel.refresh() } },
        ) {
            CollapsibleHeaderLazyPage(
                title = stringResource(R.string.settings_active_sessions),
                onBack = onBack,
                titleColor = MeeshyTheme.tokens.textPrimary,
                backArrowColor = MeeshyPalette.Indigo500,
                backgroundColor = MeeshyTheme.tokens.backgroundPrimary,
                contentPadding = PaddingValues(
                    start = MeeshySpacing.lg,
                    end = MeeshySpacing.lg,
                    bottom = MeeshySpacing.xxxl,
                ),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                sessionsContent(state, mapper, viewModel::onEvent)
            }
        }
    }

    ActiveSessionsDialogs(state, mapper, viewModel::onEvent)
}

private fun LazyListScope.sessionsContent(
    state: ActiveSessionsUiState,
    mapper: ActiveSessionsUiMapper,
    onEvent: (ActiveSessionsUiEvent) -> Unit,
) {
    when (state.mode) {
        Mode.SKELETON -> item(key = "skeleton", contentType = "skeleton") { ActiveSessionsSkeleton() }
        Mode.OFFLINE -> item(key = "offline", contentType = "unavailable") {
            Unavailable(
                icon = Icons.Filled.WifiOff,
                line = stringResource(R.string.sessions_state_offline),
                onRetry = { onEvent(ActiveSessionsUiEvent.Retry) },
            )
        }
        Mode.ERROR -> item(key = "error", contentType = "unavailable") {
            Unavailable(
                icon = Icons.Filled.Warning,
                line = stringResource(R.string.sessions_state_error),
                onRetry = { onEvent(ActiveSessionsUiEvent.Retry) },
            )
        }
        Mode.EMPTY -> item(key = "empty", contentType = "unavailable") { EmptyHint() }
        Mode.CONTENT -> loadedContent(state, mapper, onEvent)
    }
}

private fun LazyListScope.loadedContent(
    state: ActiveSessionsUiState,
    mapper: ActiveSessionsUiMapper,
    onEvent: (ActiveSessionsUiEvent) -> Unit,
) {
    item(key = "orientation", contentType = "orientation") {
        SettingsOrientation(stringResource(R.string.sessions_orientation))
    }
    state.banner?.let { banner -> item(key = "banner", contentType = "banner") { StatusBanner(banner) } }
    state.current?.let { current ->
        item(key = "header-current", contentType = "section") { SectionTitle(stringResource(R.string.sessions_current)) }
        item(key = current.id, contentType = "session") {
            SessionItem(current, mapper, state.isRevoking) {}
        }
    }
    if (state.others.isNotEmpty()) {
        item(key = "header-others", contentType = "section") { SectionTitle(stringResource(R.string.sessions_section_others)) }
        items(state.others.size, key = { state.others[it].id }, contentType = { "session" }) { index ->
            val row = state.others[index]
            SessionItem(row, mapper, state.isRevoking) { onEvent(ActiveSessionsUiEvent.RequestRevoke(row.id)) }
        }
        item(key = "revoke-others", contentType = "action") {
            RevokeOthersButton(enabled = !state.isRevoking) { onEvent(ActiveSessionsUiEvent.RequestRevokeOthers) }
        }
    } else {
        item(key = "no-others", contentType = "unavailable") { EmptyHint() }
    }
    if (state.showsGeolocation) {
        item(key = "footer", contentType = "footer") {
            ActiveSessionsFooter(
                attribution = state.attribution,
                note = MeeshyInfoNote(
                    question = stringResource(R.string.sessions_place_question),
                    text = stringResource(R.string.sessions_place_footnote),
                ),
                noteHost = rememberNoteHost(),
            )
        }
    }
}

@Composable
private fun SessionItem(
    row: SessionRowPresentation,
    mapper: ActiveSessionsUiMapper,
    isRevoking: Boolean,
    onRevoke: () -> Unit,
) {
    val texts = remember(row, mapper) { mapper.texts(row) }
    ActiveSessionRow(row = row, texts = texts, isRevoking = isRevoking, onRevoke = onRevoke)
}

@Composable
private fun SectionTitle(title: String) {
    Text(
        text = title.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = Modifier.padding(start = MeeshySpacing.xs).semantics { heading() },
    )
}

/** La liste connue reste lisible ; le bandeau dit seulement qu'elle peut dater. */
@Composable
private fun StatusBanner(banner: Banner) {
    val text = when (banner) {
        Banner.OFFLINE -> stringResource(R.string.sessions_offline_banner)
        Banner.ERROR -> stringResource(R.string.sessions_error_banner)
    }
    val icon = if (banner == Banner.OFFLINE) Icons.Filled.WifiOff else Icons.Filled.Warning
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MeeshyPalette.Warning.copy(alpha = BANNER_ALPHA), RoundedCornerShape(MeeshyRadius.md))
            .padding(MeeshySpacing.md)
            .semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(16.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
    }
}

@Composable
private fun RevokeOthersButton(enabled: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp),
        shape = RoundedCornerShape(MeeshyRadius.smPlus),
        colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Error, contentColor = MeeshyPalette.White),
    ) {
        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null, modifier = Modifier.size(16.dp))
        Text(
            text = stringResource(R.string.sessions_revoke_all_action),
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = MeeshySpacing.sm),
        )
    }
}

@Composable
private fun EmptyHint() {
    Placeholder(icon = Icons.Filled.Devices, line = stringResource(R.string.sessions_empty), onRetry = null)
}

@Composable
private fun Unavailable(icon: ImageVector, line: String, onRetry: () -> Unit) {
    Placeholder(icon = icon, line = line, onRetry = onRetry)
}

@Composable
private fun Placeholder(icon: ImageVector, line: String, onRetry: (() -> Unit)?) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xxxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = MeeshyPalette.Indigo500.copy(alpha = ICON_ALPHA),
            modifier = Modifier.size(48.dp).clearAndSetSemantics { },
        )
        Column(
            modifier = Modifier.semantics(mergeDescendants = true) {},
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                line,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
                textAlign = TextAlign.Center,
            )
        }
        if (onRetry != null) {
            TextButton(onClick = onRetry, modifier = Modifier.defaultMinSize(minHeight = 48.dp)) {
                Text(
                    stringResource(R.string.sessions_retry),
                    color = MeeshyPalette.Indigo500,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

/** Déconnecter un appareil, ou tous les autres, se confirme d'abord ; un échec se dit (alerte). */
@Composable
private fun ActiveSessionsDialogs(
    state: ActiveSessionsUiState,
    mapper: ActiveSessionsUiMapper,
    onEvent: (ActiveSessionsUiEvent) -> Unit,
) {
    val cancel = { onEvent(ActiveSessionsUiEvent.CancelConfirmation) }
    state.pendingRevocation?.let { pending ->
        AlertDialog(
            onDismissRequest = cancel,
            title = { Text(stringResource(R.string.sessions_revoke_confirm_title)) },
            text = { Text(stringResource(R.string.sessions_revoke_confirm_message, mapper.title(pending.title))) },
            confirmButton = {
                TextButton(onClick = { onEvent(ActiveSessionsUiEvent.ConfirmRevoke) }) {
                    Text(stringResource(R.string.sessions_revoke_confirm_action), color = MeeshyPalette.Error)
                }
            },
            dismissButton = { TextButton(onClick = cancel) { Text(stringResource(R.string.sessions_cancel)) } },
        )
    }
    if (state.confirmingRevokeOthers) {
        AlertDialog(
            onDismissRequest = cancel,
            title = { Text(stringResource(R.string.sessions_revoke_all_action)) },
            text = { Text(stringResource(R.string.sessions_revoke_all_confirm_message)) },
            confirmButton = {
                TextButton(onClick = { onEvent(ActiveSessionsUiEvent.ConfirmRevokeOthers) }) {
                    Text(stringResource(R.string.sessions_revoke_confirm_action), color = MeeshyPalette.Error)
                }
            },
            dismissButton = { TextButton(onClick = cancel) { Text(stringResource(R.string.sessions_cancel)) } },
        )
    }
    state.failure?.let { failure ->
        AlertDialog(
            onDismissRequest = { onEvent(ActiveSessionsUiEvent.DismissFailure) },
            title = { Text(stringResource(R.string.sessions_error_title)) },
            text = {
                Text(
                    stringResource(
                        when (failure) {
                            ActiveSessionsFailure.REVOKE_ONE -> R.string.sessions_revoke_error
                            ActiveSessionsFailure.REVOKE_OTHERS -> R.string.sessions_revoke_all_error
                        },
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = { onEvent(ActiveSessionsUiEvent.DismissFailure) }) {
                    Text(stringResource(R.string.sessions_error_ok))
                }
            },
        )
    }
}

@Composable
private fun rememberActiveSessionsUiMapper(): ActiveSessionsUiMapper {
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    val relativeStrings = rememberRelativeTimeLongStrings()
    val locale: Locale = configuration.locales[0] ?: Locale.getDefault()
    return remember(context, locale, relativeStrings) {
        val zone = ZoneId.systemDefault()
        val dates = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).withZone(zone)
        ActiveSessionsUiMapper(
            string = { res, args -> context.getString(res, *args.toTypedArray()) },
            countryName = { code -> Locale("", code).getDisplayCountry(locale).ifBlank { code } },
            dateText = { millis -> dates.format(java.time.Instant.ofEpochMilli(millis)) },
            relativeText = { millis ->
                RelativeTimeLongText.long(millis, System.currentTimeMillis(), zone, locale, relativeStrings)
            },
        )
    }
}

private const val BANNER_ALPHA = 0.12f
private const val ICON_ALPHA = 0.4f
