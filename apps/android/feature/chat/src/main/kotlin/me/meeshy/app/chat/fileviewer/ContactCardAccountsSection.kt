package me.meeshy.app.chat.fileviewer

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.contacts.ContactConnectAction
import me.meeshy.sdk.model.contacts.vcard.VCard
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Ce que la fiche d'une carte sait des comptes Meeshy qu'elle contient (#13495) : les rangées et les deux gestes. */
@Immutable
internal class ContactCardAccountsUi(
    val rows: List<ContactCardAccountRow>,
    val bind: (VCard) -> Unit,
    val onConnect: (userId: String) -> Unit,
    val onWrite: (userId: String) -> Unit,
    /** La portée interdit de rapprocher la carte : la fiche le dit (#13633). */
    val lookupUnavailable: Boolean = false,
)

/**
 * Branche le moteur de la carte à la fiche : les comptes se résolvent à la lecture de la vCard, « Écrire » ouvre la
 * conversation puis referme la fiche (comme iOS, `onWillNavigate`), un refus est dit par un message.
 */
@Composable
internal fun ContactCardHost(
    request: FileViewerRequest,
    accent: Color,
    onOpenConversation: (conversationId: String) -> Unit,
    onDismiss: () -> Unit,
) {
    val viewModel: ContactCardAccountsViewModel = hiltViewModel()
    val rows by viewModel.rows.collectAsStateWithLifecycle()
    val lookupUnavailable by viewModel.lookupUnavailable.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val haptics = rememberMeeshyHaptics()
    val connectFailed = stringResource(R.string.contact_card_toast_request_failed)
    val openFailed = stringResource(R.string.contact_card_open_failed)
    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is ContactCardAccountEvent.OpenConversation -> {
                    haptics.success()
                    onDismiss()
                    onOpenConversation(event.conversationId)
                }
                ContactCardAccountEvent.OpenFailed -> {
                    haptics.error()
                    Toast.makeText(context, openFailed, Toast.LENGTH_SHORT).show()
                }
                ContactCardAccountEvent.ConnectFailed -> {
                    haptics.error()
                    Toast.makeText(context, connectFailed, Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
    val scope = request.contactScope
    val ui = remember(rows, viewModel, scope, lookupUnavailable) {
        ContactCardAccountsUi(rows, { card -> viewModel.bind(card, scope) }, viewModel::connect, viewModel::write, lookupUnavailable)
    }
    ContactCardSheet(request, accent, onDismiss, ui)
}

/** La section « Sur Meeshy » d'un compte reconnu (miroir de `meeshySection`, iOS). */
@Composable
internal fun ContactCardAccountSection(row: ContactCardAccountRow, accent: Color, onConnect: () -> Unit, onWrite: () -> Unit) {
    val account = row.account
    val onMeeshy = stringResource(R.string.contact_card_on_meeshy)
    val spoken = stringResource(R.string.contact_card_a11y_on_meeshy, "@" + account.username)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.backgroundSecondary),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(84.dp)
                .background(Brush.linearGradient(listOf(accent.copy(alpha = 0.55f), accent.copy(alpha = 0.15f)))),
        ) {
            if (row.showsFace) {
                MeeshyAvatar(
                    name = account.displayName.ifBlank { account.username },
                    size = 44.dp,
                    containerColor = accent,
                    imageUrl = account.avatarUrl,
                    modifier = Modifier.align(Alignment.BottomStart).padding(start = MeeshySpacing.md),
                )
            }
        }
        Column(
            Modifier.padding(MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Text(
                onMeeshy.uppercase(),
                color = accent,
                fontSize = MeeshyFontSize.caption,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading(); contentDescription = spoken },
            )
            Text(
                account.displayName.ifBlank { account.username },
                color = MeeshyTheme.tokens.textPrimary,
                fontSize = MeeshyFontSize.body,
                fontWeight = FontWeight.SemiBold,
            )
            Text("@" + account.username, color = MeeshyTheme.tokens.textSecondary, fontSize = MeeshyFontSize.label)
            account.bio?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = MeeshyTheme.tokens.textPrimary, fontSize = MeeshyFontSize.label, maxLines = 4, overflow = TextOverflow.Ellipsis)
            }
            ContactCardAccountActionRow(row, accent, onConnect, onWrite)
        }
    }
}

/**
 * « Se connecter » | « Écrire » (miroir de `ContactAccountActionRow`, iOS). Soi : rien ; ami : « Écrire » seul ;
 * demande envoyée / reçue : un ÉTAT sans geste + « Écrire » ; sinon « Se connecter » plein + « Écrire » en contour.
 */
@Composable
internal fun ContactCardAccountActionRow(row: ContactCardAccountRow, accent: Color, onConnect: () -> Unit, onWrite: () -> Unit) {
    val actions = row.actions
    if (actions.connect == null && !row.canWrite) return
    Row(
        Modifier.fillMaxWidth().padding(top = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when (actions.connect) {
            ContactConnectAction.Connect ->
                ActionPill(stringResource(R.string.contact_card_action_connect), MeeshyIcons.PersonAdd, accent, filled = true, enabled = !row.isBusy, onClick = onConnect, modifier = Modifier.weight(1f))
            ContactConnectAction.Pending ->
                StatePill(stringResource(R.string.contact_card_state_request_sent), MeeshyIcons.Schedule, Modifier.weight(1f))
            ContactConnectAction.Received ->
                StatePill(stringResource(R.string.contact_card_state_request_received), MeeshyIcons.Person, Modifier.weight(1f))
            null -> Unit
        }
        if (row.canWrite) {
            ActionPill(
                stringResource(R.string.contact_card_action_write),
                MeeshyIcons.Chat,
                accent,
                filled = actions.connect == null,
                enabled = !row.isBusy,
                onClick = onWrite,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun ActionPill(label: String, icon: ImageVector, accent: Color, filled: Boolean, enabled: Boolean, onClick: () -> Unit, modifier: Modifier) {
    val content = if (filled) Color.White else accent
    Row(
        modifier = modifier
            .heightIn(min = 48.dp)
            .alpha(if (enabled) 1f else 0.6f)
            .clip(CircleShape)
            .background(if (filled) accent else accent.copy(alpha = 0.14f))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = content, modifier = Modifier.size(18.dp))
        Text(
            label,
            color = content,
            fontSize = MeeshyFontSize.label,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = MeeshySpacing.xs),
        )
    }
}

@Composable
private fun StatePill(label: String, icon: ImageVector, modifier: Modifier) {
    Row(
        modifier = modifier.heightIn(min = 48.dp).semantics(mergeDescendants = true) { },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(16.dp))
        Text(
            label,
            color = MeeshyTheme.tokens.textSecondary,
            fontSize = MeeshyFontSize.label,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            modifier = Modifier.padding(start = MeeshySpacing.xs),
        )
    }
}

/** Les sections apparaissent et disparaissent en douceur quand la résolution revient (jamais de saut de la fiche). */
@Composable
internal fun ContactCardAccountSections(accounts: ContactCardAccountsUi, accent: Color) {
    if (accounts.lookupUnavailable) {
        Text(
            text = stringResource(R.string.contact_card_lookup_unavailable_encrypted),
            fontSize = MeeshyFontSize.label,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    accounts.rows.forEach { row ->
        key(row.account.userId) {
            AnimatedVisibility(
                visible = true,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically(),
            ) {
                ContactCardAccountSection(
                    row = row,
                    accent = accent,
                    onConnect = { accounts.onConnect(row.account.userId) },
                    onWrite = { accounts.onWrite(row.account.userId) },
                )
            }
        }
    }
}
