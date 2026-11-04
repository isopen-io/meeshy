package me.meeshy.app.auth

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.vector.ImageVector
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.auth.SessionRevocationReason
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Ce que dit l'avis pour un motif (iOS `SessionClosedNoticeCopy`) : l'administrateur n'est JAMAIS nommé. */
internal data class SessionClosedNoticeCopy(
    @StringRes val title: Int,
    @StringRes val message: Int,
    val icon: ImageVector,
    val offersContact: Boolean,
) {
    companion object {
        fun of(reason: SessionRevocationReason): SessionClosedNoticeCopy = when (reason) {
            SessionRevocationReason.ADMIN_REVOKE -> SessionClosedNoticeCopy(
                R.string.session_closed_admin_title, R.string.session_closed_admin_message, MeeshyIcons.Shield, reason.offersContact,
            )
            SessionRevocationReason.USER_REVOKE -> SessionClosedNoticeCopy(
                R.string.session_closed_user_revoke_title, R.string.session_closed_user_revoke_message, MeeshyIcons.PhoneAndroid, reason.offersContact,
            )
            SessionRevocationReason.PASSWORD_CHANGED -> SessionClosedNoticeCopy(
                R.string.session_closed_password_title, R.string.session_closed_password_message, MeeshyIcons.Key, reason.offersContact,
            )
            SessionRevocationReason.LOGOUT_ALL_DEVICES -> SessionClosedNoticeCopy(
                R.string.session_closed_signed_out_title, R.string.session_closed_all_signed_out_message, MeeshyIcons.SignOut, reason.offersContact,
            )
            SessionRevocationReason.SESSION_EXPIRED -> SessionClosedNoticeCopy(
                R.string.session_closed_expired_title, R.string.session_closed_expired_message, MeeshyIcons.Schedule, reason.offersContact,
            )
            SessionRevocationReason.ACTIVATION_REQUIRED -> SessionClosedNoticeCopy(
                R.string.session_closed_activation_title, R.string.session_closed_activation_message, MeeshyIcons.Mail, reason.offersContact,
            )
            SessionRevocationReason.LOGOUT, SessionRevocationReason.UNKNOWN -> SessionClosedNoticeCopy(
                R.string.session_closed_signed_out_title, R.string.session_closed_signed_out_message, MeeshyIcons.SignOut, reason.offersContact,
            )
        }
    }
}

internal const val SESSION_CLOSED_TITLE_TAG = "session_closed_title"
internal const val SESSION_CLOSED_MESSAGE_TAG = "session_closed_message"
internal const val SESSION_CLOSED_CONTINUE_TAG = "session_closed_continue"
internal const val SESSION_CLOSED_CONTACT_TAG = "session_closed_contact"

/**
 * La feuille modale de l'avis de fermeture de session (iOS `SessionClosedNoticeView`), posée à la racine : une icône, un
 * titre, un message, « Se reconnecter » pleine largeur (acquitte l'avis) et, pour une fermeture qui appelle peut-être une
 * question, l'écriture à l'équipe (`mailto:` via `ACTION_SENDTO`).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun SessionClosedNoticeSheet(
    reason: SessionRevocationReason,
    onContinue: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    ModalBottomSheet(
        onDismissRequest = onContinue,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        modifier = modifier,
    ) {
        SessionClosedNoticeContent(reason = reason, onContinue = onContinue, onContact = { openSupportMail(context) })
    }
}

@Composable
internal fun SessionClosedNoticeContent(
    reason: SessionRevocationReason,
    onContinue: () -> Unit,
    onContact: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val copy = SessionClosedNoticeCopy.of(reason)
    val tokens = MeeshyTheme.tokens
    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.xxl)
            .padding(bottom = MeeshySpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
    ) {
        Icon(imageVector = copy.icon, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(56.dp))
        Text(
            text = stringResource(copy.title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = tokens.textPrimary,
            textAlign = TextAlign.Center,
            modifier = Modifier.testTag(SESSION_CLOSED_TITLE_TAG).semantics { heading() },
        )
        Text(
            text = stringResource(copy.message),
            style = MaterialTheme.typography.bodyLarge,
            color = tokens.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.testTag(SESSION_CLOSED_MESSAGE_TAG),
        )
        MeeshyPrimaryButton(
            text = stringResource(R.string.session_closed_continue),
            onClick = onContinue,
            modifier = Modifier.fillMaxWidth().testTag(SESSION_CLOSED_CONTINUE_TAG),
        )
        if (copy.offersContact) {
            TextButton(onClick = onContact, modifier = Modifier.fillMaxWidth().testTag(SESSION_CLOSED_CONTACT_TAG)) {
                Text(stringResource(R.string.session_closed_contact), color = MeeshyPalette.Indigo500)
            }
        }
    }
}

/** Ouvre le client de messagerie sur l'adresse du support ; aucun client installé = rien ne s'ouvre, sans erreur. */
internal fun openSupportMail(context: Context) {
    val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:${SessionRevocationReason.SUPPORT_ADDRESS}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        context.startActivity(intent)
    } catch (_: ActivityNotFoundException) {
        Unit
    }
}
