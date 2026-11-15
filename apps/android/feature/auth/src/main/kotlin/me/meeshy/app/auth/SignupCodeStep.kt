package me.meeshy.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.EmailProvenSession
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.model.auth.SignupCardStage
import me.meeshy.ui.component.auth.SpamFolderHint
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val SIGNUP_CODE_STEP_TAG: String = "signup.card.code"

/** Le compte que la carte a créé et qui attend son code. */
data class SignupCodeStep(
    val email: String,
    /** Le jeton d'attente : la carte apprend que le lien a été ouvert ailleurs. */
    val pendingSessionToken: String?,
    /** La session est TENUE ici ; faux pour un compte qui n'entre que par son code. */
    val signedIn: Boolean,
)

/** Comment le compte a été validé. */
enum class SignupProof { CODE, LINK }

/** Ce que la carte d'inscription montre (iOS `SignupCard`). */
sealed interface SignupCard {
    val stage: SignupCardStage

    data object Editing : SignupCard {
        override val stage: SignupCardStage = SignupCardStage.Editing
    }

    data class AwaitingCode(val step: SignupCodeStep) : SignupCard {
        override val stage: SignupCardStage = SignupCardStage.AwaitingCode(signedIn = step.signedIn)
    }

    /** [codeSession] : la session que la preuve par code a rendue (son utilisateur porte l'adresse prouvée). */
    data class Verified(
        val proof: SignupProof,
        val codeSession: EmailProvenSession?,
    ) : SignupCard {
        override val stage: SignupCardStage = SignupCardStage.Verified
    }
}

/**
 * La saisie du code DANS la carte (iOS `codeStep`) : « Entrez le code à 6 chiffres envoyé à …, ou ouvrez le lien
 * reçu », puis [EmailCodeEntry] — la même saisie que l'écran du code, jamais une seconde. Le code juste
 * ([onVerified]) et le lien ouvert ailleurs ([onProvenElsewhere], veillé au premier plan seulement) sont rendus à l'hôte.
 */
@Composable
internal fun SignupCodeStepContent(
    step: SignupCodeStep,
    entry: EmailVerificationViewModel,
    onVerified: (LoginOutcome) -> Unit,
    onProvenElsewhere: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by entry.state.collectAsStateWithLifecycle()
    val latestOnVerified by rememberUpdatedState(onVerified)
    val latestOnElsewhere by rememberUpdatedState(onProvenElsewhere)
    LaunchedEffect(entry, step) {
        entry.begin(step.email, password = null, accountCreated = true, pendingSessionToken = step.pendingSessionToken)
    }
    LaunchedEffect(entry) {
        entry.effect.collect { effect ->
            if (effect is EmailVerificationEffect.Verified) latestOnVerified(effect.outcome)
        }
    }
    LaunchedEffect(state.provenElsewhere) {
        if (state.provenElsewhere) latestOnElsewhere()
    }
    LifecycleResumeEffect(entry) {
        entry.onEvent(EmailVerificationEvent.WatchStarted)
        onPauseOrDispose { entry.onEvent(EmailVerificationEvent.WatchStopped) }
    }
    Column(
        modifier = modifier.fillMaxWidth().testTag(SIGNUP_CODE_STEP_TAG),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = stringResource(R.string.signup_card_code_lead, step.email),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
        )
        SpamFolderHint()
        EmailCodeEntry(
            code = state.code,
            gate = state.gate,
            error = state.error,
            provenElsewhere = state.provenElsewhere,
            onCodeChange = { entry.onEvent(EmailVerificationEvent.CodeChanged(it)) },
            onVerify = { entry.onEvent(EmailVerificationEvent.Verify) },
        )
    }
}
