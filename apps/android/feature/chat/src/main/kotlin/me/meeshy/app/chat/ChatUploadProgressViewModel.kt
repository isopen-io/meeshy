package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import me.meeshy.sdk.media.MediaUploadProgressLedger
import me.meeshy.sdk.media.UploadedAttachmentIds
import me.meeshy.ui.component.bubble.BubbleUploadProgress
import javax.inject.Inject

/**
 * Le registre des octets en vol, tendu à l'écran de conversation (#16133), avec le pont des pièces atterries que le
 * registre oublie. Il ne le copie ni ne le filtre : chaque pastille d'envoi réduit elle-même le flux au pourcentage
 * de SES pièces, si bien que ni cet écran ni la liste ne recomposent à chaque tronçon téléversé.
 */
@HiltViewModel
class ChatUploadProgressViewModel @Inject constructor(
    ledger: MediaUploadProgressLedger,
    acknowledged: UploadedAttachmentIds,
) : ViewModel() {
    val progress: BubbleUploadProgress = BubbleUploadProgress(ledger.progress) { acknowledged.serverIdOf(it) != null }
}
