package me.meeshy.sdk.preferences

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.audio.AudioPreferencesStore
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.lifecycle.AppLifecycleHook
import me.meeshy.sdk.model.ApplicationPreferences
import me.meeshy.sdk.model.AudioPreferenceSyncBody
import me.meeshy.sdk.model.AudioPreferences
import me.meeshy.sdk.model.DocumentPreferences
import me.meeshy.sdk.model.MessagePreferences
import me.meeshy.sdk.model.NotificationPreferenceSyncBody
import me.meeshy.sdk.model.PreferenceCategory
import me.meeshy.sdk.model.PreferenceCategoryCodecs
import me.meeshy.sdk.model.PrivacyPreferenceSyncBody
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.model.VideoPreferences
import me.meeshy.sdk.model.routeSegment
import me.meeshy.sdk.model.voice.ConsentPurpose
import me.meeshy.sdk.model.withDeviceUtcOffset
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.NotificationPreferencesStore
import me.meeshy.sdk.privacy.PrivacyPreferencesStore
import me.meeshy.sdk.session.PerAccountCache
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.voice.ConsentsRepository
import timber.log.Timber

/**
 * Le gestionnaire des sept catégories de préférences de l'utilisateur (iOS `UserPreferencesManager`), LOCAL D'ABORD :
 *
 * - chaque `updateX` s'applique et se persiste à l'instant (le [StateFlow] de la catégorie bouge avant tout réseau) ;
 * - la catégorie est alors marquée EN ATTENTE (jeton durable) et, une seconde après la dernière modification, son
 *   cliché complet part vers l'outbox — une ligne par catégorie, hors ligne comprise ;
 * - une attente qui n'a pas pu partir (mort du processus avant le débounce, pas de session) est REJOUÉE au démarrage, au
 *   retour au premier plan, à l'ouverture de session et à la reconnexion de la socket ;
 * - une catégorie en attente n'est jamais écrasée par la lecture du serveur (veto de [PreferencesSyncCoordinator]) ;
 * - chaque écriture des notifications ré-estampille le décalage UTC de l'appareil pour « Ne pas déranger ».
 *
 * La déconnexion ([clear]) purge valeurs, attentes et clés disque sans toucher aux observateurs qui vivent autant que le
 * processus.
 */
class UserPreferencesManager(
    private val scope: CoroutineScope,
    private val sync: CategorySyncRepository,
    private val snapshotStore: PreferenceSnapshotStore,
    private val notificationStore: NotificationPreferencesStore,
    private val privacyStore: PrivacyPreferencesStore,
    private val audioStore: AudioPreferencesStore,
    private val consents: ConsentsRepository,
    private val connection: SocketManager,
    private val coordinator: PreferencesSyncCoordinator,
    clock: CacheClock,
    private val utcOffsetMinutes: () -> Int,
    private val debounceMillis: Long = DEBOUNCE_MILLIS,
) : RealtimeBinding, AppLifecycleHook, PerAccountCache {

    private val nowMillis: () -> Long = clock::nowMillis
    private val editLock = Mutex()
    private val jobs = HashMap<PreferenceCategory, Job>()
    private val generations = HashMap<PreferenceCategory, Int>()
    private var connectionJob: Job? = null
    private var lastFetchMillis: Long? = null

    private val privacySlot = CategorySlot(
        PreferenceCategory.PRIVACY, privacyStore.preferences, { privacyStore.preferences.value },
        { privacyStore.setPreferences(it) }, { legacySnapshot(PrivacyPreferenceSyncBody.serializer(), PrivacyPreferenceSyncBody.from(it)) },
        { privacyStore.setPreferences(PrivacyPreferences()) },
    )
    private val audioSlot = CategorySlot(
        PreferenceCategory.AUDIO, audioStore.preferences, { audioStore.preferences.value },
        { audioStore.setPreferences(it) }, { legacySnapshot(AudioPreferenceSyncBody.serializer(), AudioPreferenceSyncBody.from(it)) },
        { audioStore.setPreferences(AudioPreferences()) },
    )
    private val notificationSlot = CategorySlot(
        PreferenceCategory.NOTIFICATION, notificationStore.preferences, { notificationStore.preferences.value },
        { notificationStore.setPreferences(it) },
        { legacySnapshot(NotificationPreferenceSyncBody.serializer(), NotificationPreferenceSyncBody.from(it)) },
        { notificationStore.setPreferences(UserNotificationPreferences()) },
        stamp = { it.withDeviceUtcOffset(utcOffsetMinutes()) },
    )
    private val messageSlot = storeBackedSlot(PreferenceCategoryCodecs.message, snapshotStore, clock, scope)
    private val videoSlot = storeBackedSlot(PreferenceCategoryCodecs.video, snapshotStore, clock, scope)
    private val documentSlot = storeBackedSlot(PreferenceCategoryCodecs.document, snapshotStore, clock, scope)
    private val applicationSlot = storeBackedSlot(PreferenceCategoryCodecs.application, snapshotStore, clock, scope)

    private val slots: Map<PreferenceCategory, CategorySlot<*>> = listOf(
        privacySlot, audioSlot, notificationSlot, messageSlot, videoSlot, documentSlot, applicationSlot,
    ).associateBy { it.category }

    val privacy: StateFlow<PrivacyPreferences> get() = privacySlot.state
    val audio: StateFlow<AudioPreferences> get() = audioSlot.state
    val notification: StateFlow<UserNotificationPreferences> get() = notificationSlot.state
    val message: StateFlow<MessagePreferences> get() = messageSlot.state
    val video: StateFlow<VideoPreferences> get() = videoSlot.state
    val document: StateFlow<DocumentPreferences> get() = documentSlot.state
    val application: StateFlow<ApplicationPreferences> get() = applicationSlot.state

    suspend fun updatePrivacy(transform: (PrivacyPreferences) -> PrivacyPreferences) = edit(privacySlot, transform)

    suspend fun updateAudio(transform: (AudioPreferences) -> AudioPreferences) = edit(audioSlot, transform)

    suspend fun updateMessage(transform: (MessagePreferences) -> MessagePreferences) = edit(messageSlot, transform)

    suspend fun updateNotification(transform: (UserNotificationPreferences) -> UserNotificationPreferences) =
        edit(notificationSlot, transform)

    suspend fun updateVideo(transform: (VideoPreferences) -> VideoPreferences) = edit(videoSlot, transform)

    suspend fun updateDocument(transform: (DocumentPreferences) -> DocumentPreferences) = edit(documentSlot, transform)

    suspend fun updateApplication(transform: (ApplicationPreferences) -> ApplicationPreferences) =
        edit(applicationSlot, transform)

    /**
     * L'octroi du consentement vocal en un geste : le consentement `voice-cloning` d'abord (la passerelle pose les
     * ancêtres), les fonctions audio ensuite. Un octroi refusé ne modifie RIEN en local : ni consentement supposé, ni
     * fonction activée.
     */
    suspend fun grantVoiceAutoTranslationConsent(): NetworkResult<Unit> {
        val granted = consents.grant(ConsentPurpose.VOICE_CLONING)
        if (granted is NetworkResult.Failure) return granted
        updateAudio {
            it.copy(
                transcriptionEnabled = true,
                audioTranslationEnabled = true,
                ttsEnabled = true,
                voiceProfileEnabled = true,
            )
        }
        return NetworkResult.Success(Unit)
    }

    /** Relit les sept catégories (le veto des attentes s'applique à chacune) puis les consentements confirmés. */
    suspend fun fetchFromBackend() {
        if (!sync.hasSession()) return
        PreferenceCategory.entries.forEach { coordinator.refreshCategory(it.routeSegment) }
        consents.refresh()
        lastFetchMillis = nowMillis()
    }

    /**
     * Rejoue SANS débounce chaque catégorie restée en attente d'un processus précédent : la valeur et l'attente étaient
     * déjà durables, mais rien n'avait jamais atteint la file.
     */
    suspend fun resumePending() {
        sync.pendingCategories().forEach { category ->
            editLock.withLock { jobs.remove(category)?.cancel() }
            flush(category)
        }
    }

    override fun attach() {
        connectionJob?.cancel()
        connectionJob = scope.launch {
            launch { resumePending() }
            connection.connectionState
                .filter { it == SocketConnectionState.CONNECTED }
                .collect { resumePending() }
        }
    }

    override fun detach() {
        connectionJob?.cancel()
        connectionJob = null
    }

    override suspend fun onAppCreate() = resumePending()

    override suspend fun onForeground() {
        resumePending()
        val last = lastFetchMillis
        if (last == null || nowMillis() - last > MIN_FETCH_INTERVAL_MILLIS) fetchFromBackend()
    }

    /** Déconnexion : valeurs, attentes, débounces et clés disque. Les observateurs du processus restent vivants. */
    override suspend fun clear() {
        editLock.withLock {
            jobs.values.forEach { it.cancel() }
            jobs.clear()
            generations.clear()
        }
        sync.resetPending()
        slots.values.forEach { it.reset() }
        snapshotStore.clearAll()
        lastFetchMillis = null
    }

    private suspend fun <T : Any> edit(slot: CategorySlot<T>, transform: (T) -> T) {
        editLock.withLock {
            if (!slot.edit(transform)) return
            val category = slot.category
            jobs.remove(category)?.cancel()
            generations[category] = (generations[category] ?: 0) + 1
            sync.markPending(category)
            jobs[category] = scope.launch {
                delay(debounceMillis)
                flush(category)
            }
        }
    }

    private suspend fun flush(category: PreferenceCategory) {
        val slot = slots[category] ?: return
        val generation = editLock.withLock { generations[category] }
        if (!sync.hasSession()) return
        val accepted = try {
            sync.enqueue(category, slot.currentSnapshot())
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            Timber.w(error, "Mise en file des préférences %s impossible", category.routeSegment)
            false
        }
        if (!accepted) return
        editLock.withLock { if (generations[category] == generation) sync.clearPending(category) }
    }

    private fun <B> legacySnapshot(serializer: kotlinx.serialization.KSerializer<B>, body: B): JsonObject =
        MeeshyApi.json.encodeToJsonElement(serializer, body) as JsonObject

    private companion object {
        const val DEBOUNCE_MILLIS = 1_000L
        const val MIN_FETCH_INTERVAL_MILLIS = 5 * 60 * 1_000L
    }
}
