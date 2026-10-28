package me.meeshy.ui.component.bubble

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons

/**
 * **Un envoi refusé parce que le lieu d'un fichier ne peut pas être retiré** (#13550) : la bulle échouée le DIT, et son
 * geste n'est plus « renvoyer » — les mêmes octets seraient refusés à chaque essai — mais « retirer », pour que l'auteur
 * choisisse un autre fichier. Partagé par la bulle standard et la rangée plate.
 */
internal object BubbleFailedTap {
    fun icon(isLocationRefused: Boolean): ImageVector = if (isLocationRefused) MeeshyIcons.Close else MeeshyIcons.Refresh

    @Composable
    fun label(isLocationRefused: Boolean): String =
        stringResource(if (isLocationRefused) R.string.bubble_failed_location_remove else R.string.bubble_failed_retry)
}

/** La phrase qui dit pourquoi le message n'est pas parti et ce qu'il reste à faire. */
@Composable
internal fun BubbleLocationRefusalCaption(color: Color, modifier: Modifier = Modifier) {
    Text(
        text = stringResource(R.string.bubble_failed_location_refused),
        style = MaterialTheme.typography.labelSmall,
        color = color,
        modifier = modifier,
    )
}
