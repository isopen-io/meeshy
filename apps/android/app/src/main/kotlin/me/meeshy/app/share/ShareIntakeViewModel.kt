package me.meeshy.app.share

import android.content.Context
import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import me.meeshy.app.composer.inbound.InboundShareIntake
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.ClientIdFormat
import me.meeshy.sdk.model.share.ShareIntake
import me.meeshy.sdk.model.share.ShareLimits
import me.meeshy.sdk.model.share.ShareShortfall
import me.meeshy.sdk.model.share.ShareStagingBudget
import me.meeshy.sdk.model.share.ShareStagingError
import me.meeshy.sdk.model.share.ShareStagingPolicy

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
        /** Les pièces trop lourdes pour partir ([ShareStagingPolicy.MAX_FILE_BYTES]), par leur nom assaini. */
        val tooLarge: List<String> = emptyList(),
    ) : ShareIntakeUiState

    /** Rien d'envoyable, rien à dire : l'activité se ferme. */
    data object Empty : ShareIntakeUiState
}

/**
 * **Le sujet « fichiers entrants » de l'activité de partage** (iOS : `ShareViewController.viewDidLoad` + `ShareItemLoader`).
 * L'intent est lu ([ShareIntakeReader]), chaque flux admis est copié EN FLUX dans le cache d'entrée des médias
 * ([ShareMediaStaging], [MediaIntake.directory]), puis les copies sont remises à la feuille de partage unique.
 *
 * La copie part avant tout geste : elle est donc bornée (une pièce, toutes les copies vivantes —
 * [ShareStagingPolicy]) et ne survit pas au partage. **Sans session, rien n'est copié** : Android n'a pas de reprise
 * après connexion, et la feuille dit de partager à nouveau. Une fois l'envoi tenté, la feuille libère les copies dès
 * le dernier envoi mis en file ([MediaIntake.release]) ; sans envoi, elles partent quand le partage se ferme
 * ([onCleared]) ; un processus tué les laisse au balayage du lancement suivant ([ShareStagingSweepInitializer]), et la
 * déconnexion vide le dossier.
 */
@HiltViewModel
class ShareIntakeViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val inboundIntake: InboundShareIntake,
    private val auth: AuthRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<ShareIntakeUiState>(ShareIntakeUiState.Preparing)
    val state: StateFlow<ShareIntakeUiState> = _state.asStateFlow()

    private val directory: File get() = MediaIntake.directory(context.cacheDir)
    private val sweeper = ShareStagingSweeper({ directory }, ShareStagingRegistry::isOpen)

    private var shareId: String? = null

    @Volatile
    private var sendAttempted = false

    /** Idempotent : une rotation ou un nouvel appel de `onCreate` ne relance pas la copie. */
    fun prepare(intent: Intent?) {
        if (shareId != null) return
        val id = ClientIdFormat.newCid().also { shareId = it }
        val signedIn = auth.isAuthenticated
        if (signedIn) ShareStagingRegistry.open(id)
        viewModelScope.launch {
            _state.value = withContext(Dispatchers.IO) { if (signedIn) stage(intent, id) else signedOut(intent) }
        }
    }

    /** Un envoi a été tenté depuis la feuille : c'est elle qui libère les copies, une fois le dernier envoi mis en file. */
    fun onSendAttempted() {
        sendAttempted = true
    }

    /**
     * Le partage se ferme (retour, Annuler, activité détruite) : sans envoi tenté, ses copies partent. Après un envoi tenté,
     * la feuille les lit encore jusqu'au dernier envoi mis en file puis les libère : le partage reste alors « ouvert » pour
     * que le balayage d'un partage suivant ne les lui retire pas sous les pieds.
     */
    override fun onCleared() {
        val id = shareId ?: return
        if (sendAttempted) return
        ShareStagingRegistry.close(id)
        sweeper.discard(id)
    }

    /** Sans session : le texte seul est lu, pour savoir s'il y a quelque chose à partager ; aucun flux n'est ouvert. */
    private fun signedOut(intent: Intent?): ShareIntakeUiState {
        val batch = ShareIntakeReader(inboundIntake::admitsSource).read(intent)
        if (batch.isEmpty) return ShareIntakeUiState.Empty
        return ShareIntakeUiState.Ready(batch.text, emptyList(), emptyList(), signedIn = false)
    }

    private suspend fun stage(intent: Intent?, id: String): ShareIntakeUiState = ShareStagingRegistry.copying.withLock {
        val batch = ShareIntakeReader(inboundIntake::admitsSource).read(intent)
        if (batch.isEmpty) return@withLock ShareIntakeUiState.Empty
        sweeper.sweep()
        val coroutine = currentCoroutineContext()
        val room = (ShareStagingPolicy.MAX_STAGED_BYTES - sweeper.bytesHeldByOthers(id)).coerceAtLeast(0L)
        val staging = ShareMediaStaging(
            resolver = context.contentResolver,
            directory = directory,
            budget = ShareStagingBudget(maxBytes = room),
            ensureActive = { coroutine.ensureActive() },
        )
        val results = try {
            batch.admitted.mapIndexed { index, uri -> staging.stage(uri, id, index, batch.declaredMime) }
        } catch (closed: CancellationException) {
            sweeper.discard(id)
            throw closed
        }
        val (media, failures) = ShareIntake.staging(results)
        val (tooLarge, copyFailures) = failures.partition { it is ShareStagingError.TooLarge }
        val items = media.map { MediaUploadItem.onDisk(File(directory, it.relPath.substringAfterLast('/')), it.uploadFileName, it.mime) }
        val shortfalls = ShareIntake.shortfalls(copyFailures + dropped(batch.refused, batch.overflow))
        ShareIntakeUiState.Ready(
            text = batch.text,
            items = items,
            shortfalls = shortfalls,
            signedIn = true,
            tooLarge = tooLarge.filterIsInstance<ShareStagingError.TooLarge>().map { it.fileName },
        )
    }

    private fun dropped(refused: Int, overflow: Int): List<ShareStagingError> =
        List(refused) { ShareStagingError.RefusedSource } +
            List(overflow) { ShareStagingError.FileCountExceeded(ShareLimits.MAX_FILES + it + 1, ShareLimits.MAX_FILES) }
}
