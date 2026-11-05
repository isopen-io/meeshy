package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.media.MediaUploadProgressLedger
import me.meeshy.sdk.model.media.MediaUploadProgress
import javax.inject.Inject

/**
 * Le registre des octets en vol, tendu à l'écran de conversation (#16133). Il ne le copie ni ne le filtre : chaque
 * pastille d'envoi réduit elle-même le flux au pourcentage de SES pièces, si bien que ni cet écran ni la liste ne
 * recomposent à chaque tronçon téléversé.
 */
@HiltViewModel
class ChatUploadProgressViewModel @Inject constructor(
    ledger: MediaUploadProgressLedger,
) : ViewModel() {
    val progress: StateFlow<Map<String, MediaUploadProgress>> = ledger.progress
}
