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
 * **Pourquoi un envoi échoué ne se renvoie pas** : le lieu d'un fichier ne peut pas être retiré (#13550), ou son média s'est
 * perdu sur l'appareil (#13554). Dans les deux cas la bulle le DIT, et son geste n'est plus « renvoyer » — le même échec
 * reviendrait à chaque essai — mais « retirer », pour que l'auteur choisisse de nouveau le fichier. Partagé par la bulle
 * standard et la rangée plate.
 */
internal enum class BubbleFailure {
    RETRY,
    LOCATION_REFUSED,
    MEDIA_LOST,
    ;

    val removes: Boolean get() = this != RETRY

    companion object {
        fun of(content: BubbleContent): BubbleFailure = when {
            content.isLocationRefused -> LOCATION_REFUSED
            content.isMediaLost -> MEDIA_LOST
            else -> RETRY
        }
    }
}

internal object BubbleFailedTap {
    fun icon(failure: BubbleFailure): ImageVector = if (failure.removes) MeeshyIcons.Close else MeeshyIcons.Refresh

    @Composable
    fun label(failure: BubbleFailure): String =
        stringResource(if (failure.removes) R.string.bubble_failed_location_remove else R.string.bubble_failed_retry)
}

/** La phrase qui dit pourquoi le message n'est pas parti et ce qu'il reste à faire ; rien pour un échec qu'un essai répare. */
@Composable
internal fun BubbleFailureCaption(failure: BubbleFailure, color: Color, modifier: Modifier = Modifier) {
    val text = when (failure) {
        BubbleFailure.RETRY -> return
        BubbleFailure.LOCATION_REFUSED -> R.string.bubble_failed_location_refused
        BubbleFailure.MEDIA_LOST -> R.string.bubble_failed_media_lost
    }
    Text(
        text = stringResource(text),
        style = MaterialTheme.typography.labelSmall,
        color = color,
        modifier = modifier,
    )
}
