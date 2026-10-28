package me.meeshy.app.auth.guest

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.background
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.guest.GuestNewLink
import me.meeshy.sdk.model.guest.GuestSessionEnd
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **Ce que l'invite lit quand la passerelle a termine sa session** (iOS `GuestSessionEndedView`, #10442). Un fil qui se
 * tait, ou une erreur generique, se vit comme une panne : la cause se dit, et une sortie s'offre — coller un nouveau lien
 * d'invitation, ou revenir a l'accueil.
 */
@Composable
fun GuestSessionEndedScreen(
    end: GuestSessionEnd,
    onNewLink: (identifier: String) -> Unit,
    onHome: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    var pasted by rememberSaveable { mutableStateOf("") }
    val identifier = GuestNewLink.identifier(pasted)
    BackHandler(onBack = onHome)
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(tokens.backgroundPrimary)
            .safeDrawingPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.xxl)
            .padding(bottom = MeeshySpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
    ) {
        Icon(
            imageVector = if (end == GuestSessionEnd.LINK_EXPIRED) MeeshyIcons.History else MeeshyIcons.PersonOff,
            contentDescription = null,
            tint = MeeshyPalette.Indigo500,
            modifier = Modifier.padding(top = MeeshySpacing.xxxl * 2).size(48.dp),
        )
        Text(
            text = stringResource(if (end == GuestSessionEnd.LINK_EXPIRED) R.string.guest_ended_expired_title else R.string.guest_ended_revoked_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = tokens.textPrimary,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = stringResource(if (end == GuestSessionEnd.LINK_EXPIRED) R.string.guest_ended_expired_message else R.string.guest_ended_revoked_message),
            style = MaterialTheme.typography.bodyLarge,
            color = tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        OutlinedTextField(
            value = pasted,
            onValueChange = { pasted = it },
            singleLine = true,
            placeholder = { Text(stringResource(R.string.guest_ended_new_link_placeholder)) },
            isError = pasted.isNotBlank() && identifier == null,
            supportingText = {
                if (pasted.isNotBlank() && identifier == null) Text(stringResource(R.string.guest_ended_new_link_invalid))
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { identifier?.let(onNewLink) }),
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
        )
        MeeshyPrimaryButton(
            text = stringResource(R.string.guest_ended_new_link_join),
            onClick = { identifier?.let(onNewLink) },
            enabled = identifier != null,
            modifier = Modifier.fillMaxWidth(),
        )
        TextButton(onClick = onHome, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            Text(stringResource(R.string.guest_ended_home), color = MeeshyPalette.Indigo500, fontWeight = FontWeight.SemiBold)
        }
    }
}
