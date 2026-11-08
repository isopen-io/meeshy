package me.meeshy.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.model.auth.MagicLinkCountdown
import me.meeshy.ui.component.auth.AuthActionButton
import me.meeshy.ui.component.auth.AuthContentType
import me.meeshy.ui.component.auth.AuthTextField
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La connexion par e-mail, présentée en feuille modale (iOS `MagicLinkView`) : la saisie de l'adresse, puis l'attente
 * « E-mail envoyé · Code et lien envoyés à … » — le code se saisit ICI ([EmailCodeEntry]) comme le lien s'ouvre, le
 * compte à rebours est annoncé en durée parlée, et « Annuler » revient à l'adresse.
 *
 * [onSessionOpened] est appelé quand la session s'est ouverte, feuille refermée ; [onSecondFactor] quand le code a
 * ouvert un défi de second facteur, que la connexion suit.
 */
@Composable
fun MagicLinkSheet(
    onBack: () -> Unit,
    onSessionOpened: () -> Unit = {},
    onSecondFactor: (LoginOutcome) -> Unit = {},
    viewModel: MagicLinkViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val latestOnBack by rememberUpdatedState(onBack)
    val latestOnSecondFactor by rememberUpdatedState(onSecondFactor)

    // La feuille est une présentation de la connexion : une session prouvée s'ouvre une fois elle refermée.
    DisposableEffect(viewModel) {
        viewModel.presentationBegan()
        onDispose { viewModel.presentationEnded() }
    }
    val dismissalRequested by viewModel.dismissalRequested.collectAsStateWithLifecycle()
    LaunchedEffect(dismissalRequested) {
        if (dismissalRequested) latestOnBack()
    }
    LaunchedEffect(viewModel) {
        viewModel.effect.collect { effect ->
            when (effect) {
                MagicLinkEffect.Close -> latestOnBack()
                is MagicLinkEffect.SecondFactor -> {
                    latestOnSecondFactor(effect.outcome)
                    latestOnBack()
                }
            }
        }
    }

    RecoveryScaffold(title = stringResource(R.string.auth_magic_title), onBack = onBack) {
        if (state.isWaiting) {
            MagicLinkWaiting(
                state = state,
                onEvent = viewModel::onEvent,
                onSessionOpened = onSessionOpened,
            )
        } else {
            MagicLinkEmailInput(state = state, onEvent = viewModel::onEvent)
        }
    }
}

@Composable
private fun MagicLinkEmailInput(state: MagicLinkUiState, onEvent: (MagicLinkEvent) -> Unit) {
    AuthInfoDisclosure(
        title = stringResource(R.string.auth_magic_header),
        label = stringResource(R.string.auth_magic_how_label),
        text = stringResource(R.string.auth_magic_subtitle),
    )
    AuthTextField(
        value = state.email,
        onValueChange = { onEvent(MagicLinkEvent.EmailChanged(it)) },
        title = stringResource(R.string.auth_email_label),
        icon = MeeshyIcons.Mail,
        contentType = AuthContentType.Email,
        imeAction = ImeAction.Go,
        onImeAction = { if (state.canSend) onEvent(MagicLinkEvent.Send) },
        enabled = !state.isSubmitting,
    )
    AuthErrorMessage(text = state.errorMessage)
    AuthActionButton(
        title = stringResource(R.string.auth_magic_send),
        onClick = { onEvent(MagicLinkEvent.Send) },
        enabled = state.canSend,
        isLoading = state.isSubmitting,
    )
}

@Composable
private fun MagicLinkWaiting(
    state: MagicLinkUiState,
    onEvent: (MagicLinkEvent) -> Unit,
    onSessionOpened: () -> Unit,
) {
    val email = state.sentTo.orEmpty()
    val tokens = MeeshyTheme.tokens
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Icon(
            imageVector = MeeshyIcons.MailUnread,
            contentDescription = null,
            tint = MeeshyPalette.Indigo500,
            modifier = Modifier.size(56.dp),
        )
        Text(
            text = stringResource(R.string.auth_magic_sent_title),
            style = MaterialTheme.typography.titleLarge,
            color = tokens.textPrimary,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() },
        )
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            modifier = Modifier.semantics(mergeDescendants = true) {},
        ) {
            Text(
                text = stringResource(R.string.auth_magic_sent_code_and_link),
                style = MaterialTheme.typography.bodyMedium,
                color = tokens.textMuted,
                textAlign = TextAlign.Center,
            )
            Text(
                text = email,
                style = MaterialTheme.typography.bodyLarge,
                color = MeeshyPalette.Indigo500,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )
        }
        MagicLinkCodeEntry(state = state, email = email, onEvent = onEvent, onSessionOpened = onSessionOpened)
        MagicLinkCountdownLine(countdown = state.countdown)
        MagicLinkResend(state = state, onResend = { onEvent(MagicLinkEvent.Send) })
        TextButton(onClick = { onEvent(MagicLinkEvent.Cancel) }) {
            Text(stringResource(R.string.auth_magic_cancel), color = tokens.textMuted)
        }
    }
}

/** La saisie du code à six chiffres pour CETTE adresse ; la preuve faite ailleurs s'y annonce (« Adresse confirmée »). */
@Composable
private fun MagicLinkCodeEntry(
    state: MagicLinkUiState,
    email: String,
    onEvent: (MagicLinkEvent) -> Unit,
    onSessionOpened: () -> Unit,
) {
    val code: EmailVerificationViewModel = hiltViewModel(key = email)
    val codeState by code.state.collectAsStateWithLifecycle()
    val latestOpened by rememberUpdatedState(onSessionOpened)
    LaunchedEffect(email, state.dispatchCount) {
        code.begin(email = email, password = null, accountCreated = false, pendingSessionToken = state.pendingSessionToken)
        code.refreshPendingSessionToken(state.pendingSessionToken)
    }
    LaunchedEffect(code) {
        code.effect.collect { effect ->
            if (effect is EmailVerificationEffect.Verified) {
                onEvent(MagicLinkEvent.CodeVerified(effect.outcome) { latestOpened() })
            }
        }
    }
    LifecycleResumeEffect(code) {
        code.onEvent(EmailVerificationEvent.WatchStarted)
        onPauseOrDispose { code.onEvent(EmailVerificationEvent.WatchStopped) }
    }
    EmailCodeEntry(
        code = codeState.code,
        gate = codeState.gate,
        error = codeState.error,
        provenElsewhere = codeState.provenElsewhere,
        onCodeChange = { code.onEvent(EmailVerificationEvent.CodeChanged(it)) },
        onVerify = { code.onEvent(EmailVerificationEvent.Verify) },
    )
}

/**
 * « 4:32 » en gras ; lu « Le lien expire dans 4 minutes 32 secondes » — l'horloge nue se lirait « 4 heures 32 ».
 * À zéro, « Lien expiré, renvoyez-en un nouveau ».
 */
@Composable
private fun MagicLinkCountdownLine(countdown: MagicLinkCountdown?) {
    if (countdown == null) return
    val tokens = MeeshyTheme.tokens
    if (countdown.showExpiredWarning) {
        Text(
            text = stringResource(R.string.auth_magic_expired),
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.error,
            textAlign = TextAlign.Center,
        )
        return
    }
    if (!countdown.showCountdown) return
    val label = stringResource(R.string.auth_magic_countdown_a11y)
    val spoken = countdown.spoken(LocalConfiguration.current.locales[0])
    Text(
        text = countdown.formatted,
        style = MaterialTheme.typography.titleMedium,
        color = MeeshyPalette.Indigo500,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.semantics {
            contentDescription = label
            stateDescription = spoken
        },
    )
}

/** « Renvoyer » reste grisé tant que le lien vit ; le « Rien reçu ? » reste actif — c'est alors que les indésirables servent. */
@Composable
private fun MagicLinkResend(state: MagicLinkUiState, onResend: () -> Unit) {
    val resendLabel = stringResource(R.string.auth_magic_resend)
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        TextButton(
            onClick = onResend,
            enabled = state.canResend,
            modifier = Modifier.semantics { contentDescription = resendLabel },
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                Icon(MeeshyIcons.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                Text(stringResource(R.string.auth_magic_resend_short), fontWeight = FontWeight.SemiBold)
            }
        }
        AuthErrorMessage(text = state.errorMessage)
        AuthInfoDisclosure(
            label = stringResource(R.string.auth_magic_nothing_label),
            text = stringResource(R.string.auth_magic_nothing_text),
        )
    }
}
