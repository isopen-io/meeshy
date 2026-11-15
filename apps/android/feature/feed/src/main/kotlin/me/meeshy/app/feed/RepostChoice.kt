package me.meeshy.app.feed

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.feed.R

/**
 * **Ce qu'offre le bouton Repost d'une publication** (#12234, iOS `RepostChoice`, #15869) : la republier telle
 * quelle, ou la citer. Le choix vivait en deux formes (un menu sur la carte du fil, une alerte au détail) et le rail du
 * lecteur de réels republiait au premier toucher ; le geste est désormais le même partout, et ses mots n'ont qu'une
 * source.
 */
enum class RepostChoice {
    Repost,
    Quote,
    ;

    companion object {
        /**
         * « Citer » sans porte de citation, ou « Repartager » sans écrivain, serait un contrôle sans effet : il est
         * absent, jamais inerte (iOS `RepostChoice.offered`, #15934). Une liste vide retire le bouton lui-même.
         */
        fun offered(canRepost: Boolean = true, canQuote: Boolean): List<RepostChoice> =
            listOfNotNull(Repost.takeIf { canRepost }, Quote.takeIf { canQuote })
    }
}

/** Les choix qu'offrent les deux écrivains d'un bouton Repost — `null` : l'action n'existe pas sur cette surface. */
fun RepostChoice.Companion.offeredBy(onRepost: (() -> Unit)?, onQuote: (() -> Unit)?): List<RepostChoice> =
    offered(canRepost = onRepost != null, canQuote = onQuote != null)

/**
 * Le choix Repartager / Citer / Annuler, présenté par le bouton Repost qui le porte (iOS `RepostChoiceDialog`) : le
 * titre est « Repartager », chaque choix n'apparaît que si son écrivain existe.
 */
@Composable
fun RepostChoiceDialog(
    onRepost: (() -> Unit)?,
    onQuote: (() -> Unit)?,
    onDismiss: () -> Unit,
) {
    val choices = RepostChoice.offeredBy(onRepost, onQuote)
    AlertDialog(
        onDismissRequest = onDismiss,
        modifier = Modifier.testTag(REPOST_CHOICE_DIALOG_TAG),
        title = { Text(stringResource(R.string.feed_action_repost)) },
        text = {
            Column {
                choices.forEach { choice ->
                    TextButton(onClick = { onDismiss(); choice.handler(onRepost, onQuote)?.invoke() }) {
                        Text(stringResource(choice.label))
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.feed_action_cancel)) } },
    )
}

private val RepostChoice.label: Int
    get() = when (this) {
        RepostChoice.Repost -> R.string.feed_action_repost
        RepostChoice.Quote -> R.string.feed_action_quote
    }

private fun RepostChoice.handler(onRepost: (() -> Unit)?, onQuote: (() -> Unit)?): (() -> Unit)? = when (this) {
    RepostChoice.Repost -> onRepost
    RepostChoice.Quote -> onQuote
}

const val REPOST_CHOICE_DIALOG_TAG = "repost_choice_dialog"
