package me.meeshy.app.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.EmailMasking
import me.meeshy.sdk.model.net.MaskedEmailOwner
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

internal const val SIGNUP_EMAIL_TAKEN_TAG: String = "signup.emailTaken"
internal const val SIGNUP_EMAIL_ITS_ME_TAG: String = "signup.emailTaken.itsMe"
internal const val SIGNUP_EMAIL_NOT_ME_TAG: String = "signup.emailTaken.notMe"
internal const val SIGNUP_EMAIL_FORGOT_TAG: String = "signup.emailTaken.forgot"
internal const val SIGNUP_EMAIL_LINK_ERROR_TAG: String = "signup.emailTaken.linkError"

private val ACTION_MIN_HEIGHT = 48.dp
private val OWNER_AVATAR = 44.dp

/** Ce que le bloc demande à son hôte — des rappels, jamais le ViewModel. */
internal class SignupEmailTakenActions(
    val onItsMe: () -> Unit,
    val onNotMe: () -> Unit,
    val onForgotPassword: () -> Unit,
)

/**
 * L'ADRESSE EST DÉJÀ UTILISÉE (iOS `emailTakenActions`, #8216) : « Est-ce vous ? » avec le titulaire MASQUÉ quand la
 * passerelle le sert, deux issues — « C'est moi — récupérer mon compte » (code et lien à l'adresse) et « Ce n'est pas
 * moi » (rejeu de l'inscription en revendiquant l'adresse) — et « Mot de passe oublié ? » à côté. Sans titulaire, le
 * repli est la récupération seule. Les gestes ne valent que pour l'adresse refusée : [SignupUiState.showsEmailTakenActions]
 * les retire dès qu'elle est corrigée. Le geste de récupération dit son échec SOUS lui, jamais en bandeau global.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun SignupEmailTakenBlock(
    state: SignupUiState,
    actions: SignupEmailTakenActions,
    modifier: Modifier = Modifier,
) {
    if (!state.showsEmailTakenActions) return
    val tokens = MeeshyTheme.tokens
    val owner = state.emailTaken?.owner
    val busy = state.isSubmitting || state.isValidating
    Column(
        modifier = modifier
            .fillMaxWidth()
            .testTag(SIGNUP_EMAIL_TAKEN_TAG)
            .background(tokens.inputBackground, RoundedCornerShape(MeeshyRadius.md))
            .padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (owner != null) {
            Text(
                text = stringResource(R.string.signup_email_is_it_you),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = tokens.textPrimary,
                modifier = Modifier.semantics { heading() },
            )
            EmailOwnerRow(owner = owner, maskedEmail = remember(state.form.email) { EmailMasking.partial(state.form.email) })
        }
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            verticalArrangement = Arrangement.Top,
        ) {
            RecoveryAction(
                label = stringResource(
                    if (owner != null) R.string.signup_email_its_me else R.string.signup_email_send_sign_in_link,
                ),
                inProgress = state.isRequestingSignInLink,
                enabled = !state.isRequestingSignInLink && !busy,
                tag = SIGNUP_EMAIL_ITS_ME_TAG,
                onClick = actions.onItsMe,
            )
            RecoveryAction(
                label = stringResource(R.string.signup_email_forgot_password),
                inProgress = false,
                enabled = !busy,
                tag = SIGNUP_EMAIL_FORGOT_TAG,
                onClick = actions.onForgotPassword,
            )
        }
        state.signInLinkFailure?.let { failure ->
            Text(
                text = stringResource(
                    if (failure == SignInLinkFailure.NETWORK) R.string.signup_error_network else R.string.signup_error_rejected,
                ),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = tokens.error,
                modifier = Modifier.testTag(SIGNUP_EMAIL_LINK_ERROR_TAG),
            )
        }
        if (owner != null) NotMeAction(enabled = !busy, onClick = actions.onNotMe)
    }
}

@Composable
private fun EmailOwnerRow(owner: MaskedEmailOwner, maskedEmail: String) {
    val tokens = MeeshyTheme.tokens
    Row(
        modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(
            name = owner.maskedDisplayName,
            size = OWNER_AVATAR,
            containerColor = hexColor(DynamicColorGenerator.colorForName(owner.maskedUsername)),
            imageUrl = owner.avatar,
        )
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Text(
                text = owner.maskedDisplayName,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "@${owner.maskedUsername}",
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = maskedEmail,
                style = MaterialTheme.typography.bodySmall,
                color = tokens.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun RecoveryAction(
    label: String,
    inProgress: Boolean,
    enabled: Boolean,
    tag: String,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .heightIn(min = ACTION_MIN_HEIGHT)
            .testTag(tag)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        if (inProgress) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = MeeshyPalette.Indigo500)
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyPalette.Indigo500,
        )
    }
}

@Composable
private fun NotMeAction(enabled: Boolean, onClick: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val note = stringResource(R.string.signup_email_not_me_note)
    Text(
        text = stringResource(R.string.signup_email_not_me),
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        color = tokens.textPrimary,
        modifier = Modifier
            .heightIn(min = ACTION_MIN_HEIGHT)
            .testTag(SIGNUP_EMAIL_NOT_ME_TAG)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(vertical = MeeshySpacing.sm),
    )
    Text(text = note, style = MaterialTheme.typography.labelMedium, color = tokens.textSecondary)
}
