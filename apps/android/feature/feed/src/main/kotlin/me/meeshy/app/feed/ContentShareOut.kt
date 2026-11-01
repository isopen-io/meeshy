package me.meeshy.app.feed

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.share.ShareCard
import me.meeshy.sdk.model.share.TrackedShareCard
import me.meeshy.sdk.post.PostShareLinkService

/**
 * **« Partager » : sortir un contenu de Meeshy** (#14315) — l'entrée du menu « ⋯ » d'une story, d'un réel et d'un
 * post. Le lien suivi de l'utilisateur est frappé (ou retrouvé) d'abord, puis la feuille du SYSTÈME s'ouvre sur la
 * phrase de la carte. Hors ligne ou en échec, l'adresse directe part : seule l'attribution se perd, jamais le partage.
 * « Envoyer » — la feuille Meeshy — frappe le même lien de son côté (`AppShareSheetViewModel`).
 */
@HiltViewModel
class ContentShareOutViewModel @Inject constructor(
    private val links: PostShareLinkService,
) : ViewModel() {

    fun shareOut(card: ShareCard, open: (String) -> Unit) {
        if (!TrackedShareCard.mints(card)) return open(TrackedShareCard.outgoingText(card))
        viewModelScope.launch {
            val target = links.resolve(card.contentId, TrackedShareCard.Gesture.SHARE_OUT.platform)
            val ready = if (target.tracked) TrackedShareCard.withLink(card, target.url) else card
            open(TrackedShareCard.outgoingText(ready))
        }
    }
}

/** Le geste « Partager » prêt à poser sur une entrée de menu : il prend la carte du contenu touché. */
@Composable
fun rememberContentShareOut(): (ShareCard) -> Unit {
    val viewModel: ContentShareOutViewModel = hiltViewModel()
    val context = LocalContext.current
    return remember(viewModel, context) { { card -> viewModel.shareOut(card) { text -> context.openSystemShare(text) } } }
}

internal fun Context.openSystemShare(text: String) {
    startActivity(
        Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), null),
    )
}
