package me.meeshy.sdk.media

import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MediaDownloadPolicyEngine
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.MediaSaveOutcome
import me.meeshy.sdk.model.ReceivedMediaAutoSavePolicy
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.privacy.PrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.util.resolveMediaUrl
import timber.log.Timber

/** Le registre des pièces DÉJÀ enregistrées automatiquement : une pièce reçue n'est tentée qu'une fois. */
public interface AutoSavedAttachmentClaims {
    /** `true` si la pièce n'était pas encore réservée — elle l'est désormais. */
    public fun claim(attachmentId: String): Boolean

    public fun release(attachmentId: String)
}

/** [AutoSavedAttachmentClaims] borné — les plus anciennes sortent au-delà de [capacity]. */
public open class InMemoryAutoSavedAttachmentClaims(
    initial: List<String> = emptyList(),
    private val capacity: Int = DEFAULT_CAPACITY,
) : AutoSavedAttachmentClaims {
    private val ids = LinkedHashSet(initial)

    override fun claim(attachmentId: String): Boolean = synchronized(ids) {
        if (!ids.add(attachmentId)) return false
        while (ids.size > capacity) ids.remove(ids.first())
        changed(ids.toList())
        true
    }

    override fun release(attachmentId: String) {
        synchronized(ids) { if (ids.remove(attachmentId)) changed(ids.toList()) }
    }

    protected open fun changed(ids: List<String>) {}

    public companion object {
        public const val DEFAULT_CAPACITY: Int = 4_000
    }
}

/** [AutoSavedAttachmentClaims] persistant dans des `SharedPreferences`. */
public class SharedPreferencesAutoSavedAttachmentClaims(
    private val prefs: SharedPreferences,
) : InMemoryAutoSavedAttachmentClaims(prefs.getString(KEY, null).orEmpty().split('\n').filter { it.isNotBlank() }) {
    override fun changed(ids: List<String>) {
        prefs.edit().putString(KEY, ids.joinToString("\n")).apply()
    }

    private companion object {
        private const val KEY = "autoSavedAttachmentIds.v1"
    }
}

/**
 * **Quand** enregistrer un média reçu dans la galerie (#14642) — miroir de `ReceivedMediaAutoSaver`
 * (iOS). À la RÉCEPTION de chaque `message:new`, si l'utilisateur l'a voulu
 * (`privacy.saveMediaToGallery`, désactivé par défaut) : les pièces que la règle pure
 * [ReceivedMediaAutoSavePolicy] retient, que la politique réseau laisse descendre, et qui n'ont pas
 * déjà été tentées, partent vers la galerie — dédoublonnée par l'empreinte du contenu.
 *
 * Un échec passager rend la pièce au registre ; un média déjà dans la galerie est un succès.
 */
public class ReceivedMediaAutoSaver(
    private val isEnabled: () -> Boolean,
    private val currentUserId: () -> String?,
    private val installedAtMillis: () -> Long,
    private val downloadAllowed: (MediaKind, Long?) -> Boolean,
    private val claims: AutoSavedAttachmentClaims,
    private val writer: suspend (ApiMessageAttachment) -> MediaSaveOutcome,
) {
    public suspend fun consider(message: ApiMessage) {
        if (!isEnabled()) return
        val me = currentUserId() ?: return
        ReceivedMediaAutoSavePolicy.eligibleMedia(message, me, installedAtMillis()).forEach { attachment ->
            val kind = ReceivedMediaAutoSavePolicy.kind(attachment) ?: return@forEach
            if (!downloadAllowed(kind, attachment.fileSize?.toLong())) return@forEach
            if (!claims.claim(attachment.id)) return@forEach
            val outcome = try {
                writer(attachment)
            } catch (cancelled: CancellationException) {
                claims.release(attachment.id)
                throw cancelled
            } catch (_: Exception) {
                MediaSaveOutcome.FAILED
            }
            if (outcome == MediaSaveOutcome.FAILED) claims.release(attachment.id)
        }
    }

    /**
     * Écoute [messages] dans [scope] : chaque message est considéré dans sa propre tâche — un
     * téléchargement lent ne retient jamais le flux du socket — et une erreur n'arrête pas l'écoute.
     */
    public fun listen(scope: CoroutineScope, messages: Flow<ApiMessage>): Job = scope.launch {
        messages.collect { message ->
            launch {
                try {
                    consider(message)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    Timber.w(failure, "enregistrement automatique en échec")
                }
            }
        }
    }
}

/** L'enregistrement automatique branché sur la SESSION (point d'extension [RealtimeBinding]). */
@Singleton
public class ReceivedMediaAutoSaveBinding @Inject constructor(
    @ApplicationContext context: Context,
    private val socket: MessageSocketManager,
    privacy: PrivacyPreferencesStore,
    session: SessionRepository,
    network: NetworkConditionMonitor,
    downloads: MediaDownloadPreferencesStore,
    config: MeeshyConfig,
) : RealtimeBinding {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val saver = GalleryMediaSaver(context)
    private val installedAt: Long = installationStartedAt(context)
    private val autoSaver = ReceivedMediaAutoSaver(
        isEnabled = { privacy.preferences.value.saveMediaToGallery && GalleryMediaSaver.isSupported },
        currentUserId = { session.currentUserId },
        installedAtMillis = { installedAt },
        downloadAllowed = { kind, size ->
            MediaDownloadPolicyEngine.shouldAutoDownload(kind, network.condition.value, downloads.preferences.value, size)
        },
        claims = SharedPreferencesAutoSavedAttachmentClaims(
            context.getSharedPreferences(CLAIMS_PREFS, Context.MODE_PRIVATE),
        ),
        writer = { attachment ->
            val url = attachment.fileUrl?.let { resolveMediaUrl(it, config.apiBaseUrl) }
            if (url == null) MediaSaveOutcome.FAILED else saver.saveRemote(url, attachment.mimeType)
        },
    )
    private var job: Job? = null

    override fun attach() {
        job?.cancel()
        job = autoSaver.listen(scope, socket.messageReceived)
    }

    override fun detach() {
        job?.cancel()
        job = null
    }

    private companion object {
        private const val CLAIMS_PREFS = "meeshy_media_autosave"

        /** Le début de l'installation en cours : une réinstallation remet l'horloge à zéro. */
        fun installationStartedAt(context: Context): Long = try {
            context.packageManager.getPackageInfo(context.packageName, 0).firstInstallTime
        } catch (_: PackageManager.NameNotFoundException) {
            Long.MAX_VALUE
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface ReceivedMediaAutoSaveModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: ReceivedMediaAutoSaveBinding): RealtimeBinding
}
