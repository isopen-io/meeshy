package me.meeshy.app.contacts.circles

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.relation.CircleSection
import me.meeshy.sdk.model.relation.RelationLink
import me.meeshy.ui.component.ConnectionFeedbackHost
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.component.circles.levelIcon
import me.meeshy.ui.component.circles.levelTitle
import me.meeshy.ui.component.circles.tint
import me.meeshy.ui.theme.MeeshyTheme

/**
 * « Mes cercles » (#13938) — l'onglet qui montre mes liens par niveau, ce qui manque pour monter et mes demandes de
 * montée ; iso de `CirclesTab.swift`. Cache d'abord (indicateur seulement sur cache froid), états vide / chargement /
 * erreur / hors ligne dessinés.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CirclesTab(
    onFindContacts: () -> Unit,
    viewModel: CirclesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val ritual by viewModel.ritual.collectAsStateWithLifecycle()
    var opened by remember { mutableStateOf<RelationLink?>(null) }

    LaunchedEffect(Unit) { viewModel.load() }

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.showsSkeleton -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.isEmptyState -> FullState(
                title = stringResource(R.string.circles_empty_title),
                subtitle = stringResource(R.string.circles_empty_subtitle),
                action = stringResource(R.string.circles_empty_action),
                onAction = onFindContacts,
            )
            state.visibleLinks.isEmpty() && state.hasError -> FullState(
                title = stringResource(R.string.circles_error_load),
                subtitle = null,
                action = stringResource(R.string.circles_error_retry),
                onAction = { viewModel.load(forceNetwork = true) },
            )
            state.visibleLinks.isEmpty() && state.isOffline -> FullState(
                title = stringResource(R.string.circles_offline_empty),
                subtitle = null,
                action = null,
                onAction = {},
            )
            else -> PullToRefreshBox(
                isRefreshing = state.isRefreshing,
                onRefresh = { viewModel.load(forceNetwork = true) },
                modifier = Modifier.fillMaxSize(),
            ) {
                CirclesList(
                    state = state,
                    viewModel = viewModel,
                    onOpen = { opened = it },
                )
            }
        }
        ConnectionFeedbackHost(feedback = viewModel.feedback)
    }

    opened?.let { link ->
        CircleLinkSheet(
            link = link,
            person = state.people[link.userId],
            config = state.config,
            onDismiss = { opened = null },
        )
    }
    ritual?.let { controller ->
        BloodRitualSheet(controller = controller, onFinished = viewModel::ritualFinished)
    }
}

@Composable
private fun CirclesList(
    state: CirclesUiState,
    viewModel: CirclesViewModel,
    onOpen: (RelationLink) -> Unit,
) {
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 8.dp)) {
        item(key = "banner") { Banner(state = state, onRetry = { viewModel.load(forceNetwork = true) }) }
        if (state.incomingRaises.isNotEmpty() || state.outgoingRaises.isNotEmpty()) {
            item(key = "requests-header") {
                Text(
                    text = stringResource(R.string.circles_section_requests),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .semantics { heading() },
                )
            }
            items(state.incomingRaises, key = { "in-${it.id}" }) { request ->
                CircleRequestRow(
                    request = request,
                    incoming = true,
                    name = viewModel.nameOf(request.senderId, request.sender?.let { s -> s.displayName ?: s.username }),
                    config = state.config,
                    onAccept = { viewModel.accept(request) },
                    onDecline = { viewModel.decline(request) },
                    onCancel = {},
                    onRitual = { viewModel.openRitual(request.senderId, request.sender?.displayName) },
                    modifier = Modifier.animateItem(),
                )
            }
            items(state.outgoingRaises, key = { "out-${it.id}" }) { request ->
                CircleRequestRow(
                    request = request,
                    incoming = false,
                    name = viewModel.nameOf(request.receiverId, request.receiver?.let { r -> r.displayName ?: r.username }),
                    config = state.config,
                    onAccept = {},
                    onDecline = {},
                    onCancel = { viewModel.cancel(request) },
                    onRitual = { viewModel.openRitual(request.receiverId, request.receiver?.displayName) },
                    modifier = Modifier.animateItem(),
                )
            }
        }
        state.sections.forEach { section ->
            item(key = "section-${section.level.wire}") { SectionHeader(section, state) }
            items(section.links, key = { "link-${it.userId}" }) { link ->
                CircleLinkRow(
                    link = link,
                    person = state.people[link.userId],
                    pending = state.pendingLevel(link.userId),
                    config = state.config,
                    onOpen = { onOpen(link) },
                    onRaise = { viewModel.requestRaise(link) },
                    modifier = Modifier.animateItem(),
                )
            }
        }
    }
}

/** Le cache reste affiché ; l'état se dit discrètement au-dessus. */
@Composable
private fun Banner(state: CirclesUiState, onRetry: () -> Unit) {
    when {
        state.hasError -> Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp)
                .semantics(mergeDescendants = true) {},
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(MeeshyIcons.WarningFilled, contentDescription = null, tint = MeeshyPalette.Warning)
            Spacer(Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.circles_error_load),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onRetry, modifier = Modifier.heightIn(min = 44.dp)) {
                Text(stringResource(R.string.circles_error_retry))
            }
        }
        state.isOffline -> Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .semantics(mergeDescendants = true) {},
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(MeeshyIcons.WifiOff, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary)
            Spacer(Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.circles_offline_banner),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        else -> Unit
    }
}

@Composable
private fun SectionHeader(section: CircleSection, state: CirclesUiState) {
    val title = levelTitle(section.level, state.config)
    val count = section.links.size
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp)
            .semantics(mergeDescendants = true) { heading() },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(text = levelIcon(section.level, state.config), modifier = Modifier.clearAndSetSemantics {})
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = section.level.tint(),
        )
        Text(
            text = count.toString(),
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

@Composable
private fun FullState(title: String, subtitle: String?, action: String?, onAction: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
        subtitle?.let {
            Spacer(Modifier.padding(4.dp))
            Text(
                text = it,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
                textAlign = TextAlign.Center,
            )
        }
        action?.let {
            Spacer(Modifier.padding(8.dp))
            Button(
                onClick = onAction,
                colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.Indigo500),
                modifier = Modifier.heightIn(min = 44.dp),
            ) { Text(it) }
        }
    }
}
