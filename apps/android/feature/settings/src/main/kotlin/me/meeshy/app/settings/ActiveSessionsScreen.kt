package me.meeshy.app.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.net.api.ActiveSessionInfo
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Sessions actives du compte (GET auth/sessions) : la courante marquee, les autres
 * revocables une par une, et un bouton global "deconnecter les autres appareils".
 */
@Composable
fun ActiveSessionsScreen(
    onBack: () -> Unit,
    viewModel: ActiveSessionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    MeeshyBackground {
        // Cet ecran n'a pas de Scaffold : il pose lui-meme son inset depuis que le
        // Scaffold racine ne reserve plus les barres systeme (MeeshyApp.kt). Le fond
        // reste plein ecran, seul le contenu est retreci.
        Column(modifier = Modifier.fillMaxSize().systemBarsPadding()) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = MeeshySpacing.xl, start = MeeshySpacing.sm),
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.settings_back),
                        tint = MeeshyTheme.tokens.textPrimary,
                    )
                }
                Text(
                    text = stringResource(R.string.settings_active_sessions),
                    style = MaterialTheme.typography.headlineSmall,
                    color = MeeshyTheme.tokens.textPrimary,
                    fontWeight = FontWeight.Bold,
                )
            }

            when {
                state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MeeshyPalette.Indigo500)
                }
                state.errorMessage != null -> Column(
                    modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.xl),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = state.errorMessage.orEmpty(),
                        color = MeeshyPalette.Error,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    TextButton(onClick = viewModel::load) {
                        Text(stringResource(R.string.sessions_retry))
                    }
                }
                else -> LazyColumn(
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(MeeshySpacing.lg),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                ) {
                    items(state.sessions, key = { it.id }) { session ->
                        SessionRow(
                            session = session,
                            isRevoking = state.revokingIds.contains(session.id),
                            onRevoke = { viewModel.revoke(session.id) },
                        )
                    }
                    if (state.sessions.any { !it.isCurrentSession }) {
                        item(key = "revoke_others") {
                            TextButton(
                                onClick = viewModel::revokeOthers,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text(
                                    text = stringResource(R.string.sessions_revoke_others),
                                    color = MeeshyPalette.Error,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SessionRow(
    session: ActiveSessionInfo,
    isRevoking: Boolean,
    onRevoke: () -> Unit,
) {
    MeeshyGlassSurface(
        shape = RoundedCornerShape(MeeshyRadius.lg),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(if (session.isCurrentSession) MeeshyPalette.Success else MeeshyPalette.Indigo500),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (session.isMobile == true) Icons.Filled.PhoneAndroid else Icons.Filled.Computer,
                    contentDescription = null,
                    tint = MeeshyPalette.White,
                    modifier = Modifier.size(22.dp),
                )
            }
            Spacer(Modifier.width(MeeshySpacing.md))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = sessionTitle(session),
                    style = MaterialTheme.typography.titleSmall,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                )
                val location = listOfNotNull(session.city, session.country).joinToString(", ")
                if (location.isNotBlank()) {
                    Text(
                        text = location,
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textMuted,
                        maxLines = 1,
                    )
                }
                if (session.isCurrentSession) {
                    Text(
                        text = stringResource(R.string.sessions_current),
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyPalette.Success,
                    )
                }
            }
            if (!session.isCurrentSession) {
                if (isRevoking) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Text(
                        text = stringResource(R.string.sessions_revoke),
                        style = MaterialTheme.typography.labelLarge,
                        color = MeeshyPalette.Error,
                        modifier = Modifier
                            .clip(RoundedCornerShape(MeeshyRadius.pill))
                            .clickable(onClick = onRevoke)
                            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
                    )
                }
            }
        }
    }
}

/** "Pixel 8 · Android 15" / "Chrome · macOS" — le plus specifique disponible. */
internal fun sessionTitle(session: ActiveSessionInfo): String {
    val device = listOfNotNull(session.deviceVendor, session.deviceModel)
        .joinToString(" ")
        .ifBlank { session.browserName.orEmpty() }
    val os = listOfNotNull(session.osName, session.osVersion).joinToString(" ")
    return listOf(device, os).filter { it.isNotBlank() }.joinToString(" · ")
        .ifBlank { session.ipAddress ?: session.id }
}
