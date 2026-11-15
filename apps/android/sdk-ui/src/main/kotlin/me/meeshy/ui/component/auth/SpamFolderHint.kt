package me.meeshy.ui.component.auth

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyTheme

/**
 * « Rien reçu ? Regardez aussi dans vos spams ou courriers indésirables. » — la ligne discrète posée
 * sous chaque confirmation d'envoi d'un E-MAIL (#16937), même texte que le web (`emailSent.checkSpam`).
 * Un SMS n'a pas de dossier spam : aucun écran de numéro ne la monte.
 */
@Composable
fun SpamFolderHint(modifier: Modifier = Modifier, textAlign: TextAlign? = null) {
    Text(
        text = stringResource(R.string.email_check_spam),
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyTheme.tokens.textSecondary,
        textAlign = textAlign,
        modifier = modifier,
    )
}
