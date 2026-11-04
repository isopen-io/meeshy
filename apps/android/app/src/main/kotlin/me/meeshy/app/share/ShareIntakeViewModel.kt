package me.meeshy.app.share

import android.content.Context
import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.app.composer.inbound.InboundShareIntake
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.ClientIdFormat
import me.meeshy.sdk.model.share.ShareCancelPolicy
import me.meeshy.sdk.model.share.ShareIntake
import me.meeshy.sdk.model.share.ShareLimits
import me.meeshy.sdk.model.share.ShareShortfall
import me.meeshy.sdk.model.share.ShareStagingBudget
import me.meeshy.sdk.model.share.ShareStagingError
import me.meeshy.sdk.share.SharePendingShareStore

/**
 * Ce que l'activité de partage montre : la préparation (les copies courent, jamais un envoi avec une pièce encore en
 * copie), puis la feuille avec les fichiers copiés, le texte joint et ce que le partage a laissé derrière lui.
 */
sealed interface ShareIntakeUiState {
    data object Preparing : ShareIntakeUiState

    data class Ready(
        val text: String?,
        val items: List<MediaUploadItem>,
        val shortfalls: List<ShareShortfall>,
        val signedIn: Boolean,
    ) : ShareIntakeUiState

    /** Rien d'envoyable, rien à dire : l'activité se ferme. */
    data object Empty : ShareIntakeUiState
}

/**
 * **Le sujet « fichiers entrants » de l'activité de partage** (iOS : `ShareViewController.viewDidLoad` + `ShareItemLoader`).
 * L'intent est lu ([ShareIntakeReader]), chaque flux admis est copié EN FLUX dans l'espace durable du partage
 * ([ShareMediaStaging]) sous un budget commun (100 fichiers, 5 Gio), puis les copies sont remises à la feuille de partage
 * unique. Les copies survivent à la rotation (le view model) et à un processus tué (le balayage de sept jours).
 *
 * **Annuler n'efface que sans envoi ni fiche** ([ShareCancelPolicy]) ; sans session, rien n'est effacé : les copies
 * attendent la connexion, et le balayage les reprend si personne ne revient.
 */
@HiltViewModel
class ShareIntakeViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val inboundIntake: InboundShareIntake,
    private val store: SharePendingShareStore,
    private val auth: AuthRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<ShareIntakeUiState>(ShareIntakeUiState.Preparing)
    val state: StateFlow<ShareIntakeUiState> = _state.asStateFlow()

    private var shareId: String? = null
    private var sendAttempted = false

    /** Idempotent : une rotation ou un nouvel appel de `onCreate` ne relance pas la copie. */
    fun prepare(intent: Intent?) {
        if (shareId != null) return
        val id = ClientIdFormat.newCid().also { shareId = it }
        viewModelScope.launch { _state.value = withContext(Dispatchers.IO) { stage(intent, id) } }
    }

    /** Un envoi a été tenté depuis la feuille : Annuler n'a plus de sens, les copies sont à l'envoi. */
    fun onSendAttempted() {
        sendAttempted = true
    }

    /** La feuille se ferme : sans envoi tenté et avec une session, les copies de ce partage quittent le disque. */
    fun onClosed() {
        val id = shareId ?: return
        val signedIn = auth.isAuthenticated
        val mayDiscard = ShareCancelPolicy.mayDiscardStagedMedia(sendWasAttempted = sendAttempted, holdsPendingRecord = store.hasRecord(id))
        if (!mayDiscard || !signedIn) return
        viewModelScope.launch(Dispatchers.IO) { store.mediaDirectory(id).deleteRecursively() }
    }

    private fun stage(intent: Intent?, id: String): ShareIntakeUiState {
        val batch = ShareIntakeReader(inboundIntake::admitsSource).read(intent)
        if (batch.isEmpty) return ShareIntakeUiState.Empty
        val staging = ShareMediaStaging(context.contentResolver, { store.mediaDirectory(it) }, ShareStagingBudget())
        val results = batch.admitted.mapIndexed { index, uri -> staging.stage(uri, id, index, batch.declaredMime) }
        val (media, copyFailures) = ShareIntake.staging(results)
        val directory = store.mediaDirectory(id)
        val items = media.map { MediaUploadItem.onDisk(File(directory, it.relPath.substringAfterLast('/')), it.uploadFileName, it.mime) }
        val shortfalls = ShareIntake.shortfalls(copyFailures + dropped(batch.refused, batch.overflow))
        return ShareIntakeUiState.Ready(batch.text, items, shortfalls, auth.isAuthenticated)
    }

    private fun dropped(refused: Int, overflow: Int): List<ShareStagingError> =
        List(refused) { ShareStagingError.RefusedSource } +
            List(overflow) { ShareStagingError.FileCountExceeded(ShareLimits.MAX_FILES + it + 1, ShareLimits.MAX_FILES) }
}
