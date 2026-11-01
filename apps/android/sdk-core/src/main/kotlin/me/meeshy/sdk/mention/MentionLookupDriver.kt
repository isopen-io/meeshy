package me.meeshy.sdk.mention

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.mention.MentionContext
import me.meeshy.sdk.model.mention.MentionLookupLaw
import me.meeshy.sdk.model.mention.MentionLookupStage

/**
 * Runs the « @ » law of #14053 for one composer, whatever holds its [MentionAutocompleteState]:
 * every keystroke serves the local cache at once — the [MentionContacts] (accepted friends), then
 * the [updateRoster] people of the context — and [MentionLookupLaw.stage] decides whether the
 * network is asked too: from the third character, or from the second when the first two letters
 * found nobody locally. The debounced answer of [MentionSearch.suggest] for the [bind] context is
 * merged below the local matches, in the gateway's order, without duplicates or the caller; an
 * answer for a fragment the user has since left is dropped.
 *
 * The host keeps its state where it wants it: [read] and [write] are its accessors.
 */
public class MentionLookupDriver(
    private val scope: CoroutineScope,
    private val search: MentionSearch,
    private val contacts: MentionContacts,
    private val selfId: () -> String?,
    private val read: () -> MentionAutocompleteState,
    private val write: ((MentionAutocompleteState) -> MentionAutocompleteState) -> Unit,
    private val debounceMs: Long = DEBOUNCE_MS,
) {

    private var context: MentionContext? = null
    private var roster: List<MentionCandidate> = emptyList()
    private var bound = false
    private var lookup: Job? = null

    /** Sets the context the network is asked about; the first bind, and every change, re-reads the contact cache. */
    public fun bind(context: MentionContext?) {
        val changed = !bound || context != this.context
        this.context = context
        bound = true
        if (changed) warmContacts()
    }

    /** The people of the context already known locally (conversation members, thread authors). */
    public fun updateRoster(roster: List<MentionCandidate>) {
        this.roster = roster
    }

    public fun onTextChange(text: String) {
        lookup?.cancel()
        val query = MentionComposer.extractQuery(text)
        if (query == null) {
            write { it.cleared() }
            return
        }
        val local = localMatches(query)
        write { it.copy(activeQuery = query, suggestions = local) }
        if (MentionLookupLaw.stage(query, localMatchCount = local.size) == MentionLookupStage.REMOTE) {
            lookUpRemote(query)
        }
    }

    /** Inserts [candidate]'s handle in place of the `@fragment` of [text], records it, closes the panel; returns the new text. */
    public fun select(candidate: MentionCandidate, text: String): String {
        lookup?.cancel()
        write { it.select(candidate, text).second }
        return MentionComposer.insertMention(candidate, text)
    }

    /** Forgets the panel and the inserted mentions, e.g. once the text has been sent. */
    public fun reset() {
        lookup?.cancel()
        write { it.reset() }
    }

    private fun localMatches(query: String): List<MentionCandidate> =
        MentionLookupLaw.localMatches(
            contacts = contacts.snapshot(),
            context = roster,
            query = query,
            selfId = selfId(),
            membersOnly = context?.membersOnly == true,
        )

    private fun lookUpRemote(query: String) {
        val viewer = selfId()
        val target = context
        lookup = scope.launch {
            delay(debounceMs)
            val remote = try {
                search.suggest(query.trim(), target)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                return@launch
            }
            write { state -> state.merged(query, local = state.suggestions, remote = remote, viewer = viewer) }
        }
    }

    private fun warmContacts() {
        scope.launch {
            try {
                contacts.refresh()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                return@launch
            }
            val query = read().activeQuery ?: return@launch
            val local = localMatches(query)
            write { state -> state.merged(query, local = local, remote = state.suggestions, viewer = selfId()) }
        }
    }

    private fun MentionAutocompleteState.merged(
        query: String,
        local: List<MentionCandidate>,
        remote: List<MentionCandidate>,
        viewer: String?,
    ): MentionAutocompleteState =
        if (activeQuery != query) this
        else copy(suggestions = MentionLookupLaw.mergeCandidates(local, remote, viewer))

    public companion object {
        public const val DEBOUNCE_MS: Long = 300L
    }
}

/**
 * A [MentionLookupDriver] that owns its [state] — for the composers whose screen state has no
 * mention panel of its own (reel and story comments, story and mood replies).
 */
public class MentionAutocomplete(
    scope: CoroutineScope,
    search: MentionSearch,
    contacts: MentionContacts,
    selfId: () -> String?,
    debounceMs: Long = MentionLookupDriver.DEBOUNCE_MS,
) {
    private val _state = MutableStateFlow(MentionAutocompleteState())
    public val state: StateFlow<MentionAutocompleteState> = _state.asStateFlow()

    private val driver = MentionLookupDriver(
        scope = scope,
        search = search,
        contacts = contacts,
        selfId = selfId,
        read = { _state.value },
        write = { transform -> _state.update(transform) },
        debounceMs = debounceMs,
    )

    public fun bind(context: MentionContext?): Unit = driver.bind(context)

    public fun onTextChange(text: String): Unit = driver.onTextChange(text)

    public fun select(candidate: MentionCandidate, text: String): String = driver.select(candidate, text)

    public fun reset(): Unit = driver.reset()
}
