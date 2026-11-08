package me.meeshy.app.conversations

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.conversationlist.ConversationPreviewFingerprint
import me.meeshy.sdk.model.conversationlist.ConversationPreviewIntent
import me.meeshy.sdk.model.conversationlist.ConversationPreviewLaw
import me.meeshy.sdk.model.conversationlist.ConversationPreviewPhase
import me.meeshy.sdk.model.conversationlist.ConversationPreviewProvenance
import me.meeshy.sdk.model.conversationlist.ConversationPreviewSnapshot
import me.meeshy.sdk.model.conversationlist.PreviewCacheReading

/** Ce que l'aperçu lit du cache local, avec sa fraîcheur : [messages] du plus ancien au plus récent. */
internal class CachedPreview(val reading: PreviewCacheReading, val messages: List<ApiMessage>)

/** Couture de test du chargeur : il ne touche jamais un dépôt en direct. */
internal interface ConversationPreviewSource {
    suspend fun cached(conversationId: String): CachedPreview

    /** Les cinq derniers messages servis par le réseau, `null` sur tout échec. */
    suspend fun fetchRecent(conversationId: String): List<ApiMessage>?
}

internal class RepositoryConversationPreviewSource(
    private val repository: MessageRepository,
) : ConversationPreviewSource {
    override suspend fun cached(conversationId: String): CachedPreview {
        val messages = guarded { repository.recentMessages(conversationId).map { it.message } }.orEmpty()
        val fresh = guarded { repository.isCacheFresh(conversationId) } == true
        val reading = when {
            fresh -> PreviewCacheReading.Fresh(hasMessages = messages.isNotEmpty())
            messages.isNotEmpty() -> PreviewCacheReading.Stale
            else -> PreviewCacheReading.Absent
        }
        return CachedPreview(reading, messages)
    }

    override suspend fun fetchRecent(conversationId: String): List<ApiMessage>? =
        guarded { repository.recentMessagesFromNetwork(conversationId, ConversationPreviewLaw.PREVIEW_LIMIT) }

    private suspend fun <T> guarded(block: suspend () -> T): T? = try {
        block()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }
}

/** Les cinq états de l'aperçu d'une conversation, jamais un `null` ambigu. */
internal sealed interface PreviewState {
    val phase: ConversationPreviewPhase
    val snapshot: ConversationPreviewSnapshot? get() = null

    data object Loading : PreviewState { override val phase = ConversationPreviewPhase.Loading }
    data class Loaded(override val snapshot: ConversationPreviewSnapshot) : PreviewState {
        override val phase = ConversationPreviewPhase.Loaded
    }
    data object Empty : PreviewState { override val phase = ConversationPreviewPhase.Empty }
    data object Unavailable : PreviewState { override val phase = ConversationPreviewPhase.Unavailable }
    data object Sealed : PreviewState { override val phase = ConversationPreviewPhase.Sealed }

    fun fingerprint(): ConversationPreviewFingerprint = ConversationPreviewFingerprint.of(phase, snapshot)
}

/**
 * **Les cinq derniers messages d'une conversation, lus pour l'aperçu d'appui long** — cache d'abord,
 * réseau ensuite (miroir de `ConversationListPreviewLoader`, iOS #11212).
 *
 * Trois intentions dédoublonnées avec montée en gamme ([ConversationPreviewIntent]) ; un résultat
 * réseau n'est jamais écrasé par un cache plus ancien ; la traduction de chaque message est élue
 * par le Prisme du lecteur ; un message chiffré non déchiffrable est scellé ; rien ne se republie
 * quand l'empreinte n'a pas bougé. Le réseau ne passe jamais dans Room : le fil garde son cache.
 *
 * Les états se mutent depuis le contexte de [scope] (le scope du ViewModel : main).
 */
internal class ConversationPreviewLoader(
    private val scope: CoroutineScope,
    private val source: ConversationPreviewSource,
    private val prefs: () -> LanguageResolver.ContentLanguagePreferences?,
    private val isLocked: (String) -> Boolean,
    private val ownerId: () -> String?,
) {
    private val _states = MutableStateFlow<Map<String, PreviewState>>(emptyMap())
    val states: StateFlow<Map<String, PreviewState>> = _states

    private class Running(val intent: ConversationPreviewIntent, val job: Job)

    private class Request(val conversationId: String, val intent: ConversationPreviewIntent, val generation: Int, val owner: String)

    private val inFlight = HashMap<String, Running>()
    private val provenance = HashMap<String, ConversationPreviewProvenance>()
    private val coldPrefetched = HashSet<String>()
    private var generation = 0
    private var owner: String? = null

    /** Une conversation jamais chargée se lit `Loading` ; verrouillée, `Sealed` quoi qu'on ait servi. */
    fun state(conversationId: String): PreviewState =
        if (isLocked(conversationId)) PreviewState.Sealed else _states.value[conversationId] ?: PreviewState.Loading

    fun fingerprint(conversationId: String): ConversationPreviewFingerprint = state(conversationId).fingerprint()

    /** Le compte sort : aucun clair, aucune provenance, aucun chargement en vol ne survit. */
    fun purge() {
        generation += 1
        inFlight.values.forEach { it.job.cancel() }
        inFlight.clear()
        provenance.clear()
        coldPrefetched.clear()
        _states.value = emptyMap()
    }

    /** Un verrou posé fait quitter la mémoire au clair déjà servi. */
    fun dropLocked() {
        val locked = _states.value.keys.filter(isLocked)
        if (locked.isEmpty()) return
        _states.update { it - locked.toSet() }
        locked.forEach { provenance.remove(it); coldPrefetched.remove(it) }
    }

    suspend fun load(conversationId: String, intent: ConversationPreviewIntent) {
        val current = ownerId().orEmpty()
        if (current != owner) {
            if (owner != null) purge()
            owner = current
        }
        if (isLocked(conversationId)) {
            _states.update { it - conversationId }
            provenance.remove(conversationId)
            return
        }
        while (true) {
            val running = inFlight[conversationId] ?: break
            running.job.join()
            if (inFlight[conversationId] === running) inFlight.remove(conversationId)
            if (!ConversationPreviewLaw.mustWaitThenRerun(running.intent, intent) || ownerId().orEmpty() != current) return
        }
        if (isSettled(conversationId, intent)) return
        val request = Request(conversationId, intent, generation, current)
        val job = scope.launch(start = CoroutineStart.LAZY) { perform(request) }
        inFlight[conversationId] = Running(intent, job)
        job.invokeOnCompletion { if (inFlight[conversationId]?.job === job) inFlight.remove(conversationId) }
        job.start()
        job.join()
    }

    private fun isSettled(conversationId: String, intent: ConversationPreviewIntent): Boolean =
        ConversationPreviewLaw.isSettled(intent, provenance[conversationId]) ||
            (intent == ConversationPreviewIntent.Prefetch && conversationId in coldPrefetched)

    private fun mayWrite(request: Request): Boolean =
        request.generation == generation && ownerId().orEmpty() == request.owner && !isLocked(request.conversationId)

    private suspend fun perform(request: Request) {
        val id = request.conversationId
        val cached = source.cached(id)
        if (!mayWrite(request)) return
        if (cached.messages.isNotEmpty() && ConversationPreviewLaw.mayPublishCache(provenance[id])) {
            publish(id, cached.messages)
            ConversationPreviewLaw.provenanceOf(cached.reading)?.let { provenance[id] = it }
        } else if (cached.messages.isEmpty()) {
            coldPrefetched += id
        }
        if (!ConversationPreviewLaw.needsNetwork(request.intent, cached.reading)) return
        refresh(request)
    }

    private suspend fun refresh(request: Request) {
        val id = request.conversationId
        val served = source.fetchRecent(id)
        if (!mayWrite(request)) return
        if (served == null) {
            if (state(id).let { it is PreviewState.Loading }) setState(id, PreviewState.Unavailable)
            return
        }
        publish(id, served)
        provenance[id] = ConversationPreviewProvenance.Network
    }

    private fun publish(conversationId: String, messages: List<ApiMessage>) {
        if (isLocked(conversationId)) return
        val next = if (messages.isEmpty()) {
            PreviewState.Empty
        } else {
            PreviewState.Loaded(ConversationPreviewSnapshot.of(messages, prefs() ?: NoLanguagePreferences))
        }
        setState(conversationId, next)
    }

    /** Rien ne se republie quand l'empreinte est identique : aucune rangée ne se redessine pour rien. */
    private fun setState(conversationId: String, next: PreviewState) {
        _states.update { held ->
            val old = held[conversationId]
            if (old != null && old.fingerprint() == next.fingerprint()) held else held + (conversationId to next)
        }
    }
}

/** La projection de l'interface : les messages des aperçus servis (liste vide = constaté vide). */
internal fun Map<String, PreviewState>.loadedMessages(): Map<String, List<me.meeshy.sdk.conversation.LocalMessage>> =
    mapNotNull { (id, preview) ->
        when (preview) {
            is PreviewState.Loaded -> id to preview.snapshot.messages.map { me.meeshy.sdk.conversation.LocalMessage(it) }
            PreviewState.Empty -> id to emptyList<me.meeshy.sdk.conversation.LocalMessage>()
            else -> null
        }
    }.toMap()

internal fun Map<String, PreviewState>.unavailableIds(): Set<String> =
    filterValues { it == PreviewState.Unavailable }.keys
