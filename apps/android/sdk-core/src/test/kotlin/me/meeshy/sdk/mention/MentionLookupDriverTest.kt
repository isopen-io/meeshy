package me.meeshy.sdk.mention

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.mention.MentionContext
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MentionLookupDriverTest {

    private fun person(username: String, id: String = "u-$username") =
        MentionCandidate(id = id, username = username, displayName = username)

    private class RecordingSearch(private val answer: (String) -> List<MentionCandidate> = { emptyList() }) : MentionSearch {
        val asked = mutableListOf<Pair<String, MentionContext?>>()

        override suspend fun search(query: String): List<MentionCandidate> = error("the contextual entry must be used")

        override suspend fun suggest(query: String, context: MentionContext?): List<MentionCandidate> {
            asked += query to context
            return answer(query)
        }
    }

    private class FixedContacts(private val cached: List<MentionCandidate>) : MentionContacts {
        private var served: List<MentionCandidate> = emptyList()
        var refreshes = 0

        override fun snapshot(): List<MentionCandidate> = served

        override suspend fun refresh() {
            refreshes++
            served = cached
        }
    }

    private fun TestScope.autocomplete(
        search: MentionSearch,
        contacts: MentionContacts = MentionContacts.None,
        self: String? = "me",
    ) = MentionAutocomplete(scope = this, search = search, contacts = contacts, selfId = { self })

    @Test
    fun `a bare at sign opens the local contacts at once, without the network`() = runTest {
        val search = RecordingSearch()
        val mentions = autocomplete(search, FixedContacts(listOf(person("anna"), person("bob"))))
        mentions.bind(MentionContext.post("p1"))
        advanceUntilIdle()

        mentions.onTextChange("hi @")
        advanceUntilIdle()

        assertThat(mentions.state.value.suggestions.map { it.username }).containsExactly("anna", "bob").inOrder()
        assertThat(search.asked).isEmpty()
    }

    @Test
    fun `two letters with a local match stay local`() = runTest {
        val search = RecordingSearch()
        val mentions = autocomplete(search, FixedContacts(listOf(person("anna"))))
        mentions.bind(MentionContext.post("p1"))
        advanceUntilIdle()

        mentions.onTextChange("@an")
        advanceUntilIdle()

        assertThat(mentions.state.value.suggestions.map { it.username }).containsExactly("anna")
        assertThat(search.asked).isEmpty()
    }

    @Test
    fun `two letters without a local match ask the network about the context`() = runTest {
        val search = RecordingSearch { listOf(person("zoe")) }
        val mentions = autocomplete(search, FixedContacts(listOf(person("anna"))))
        mentions.bind(MentionContext.post("p1"))
        advanceUntilIdle()

        mentions.onTextChange("@zo")
        advanceUntilIdle()

        assertThat(search.asked).containsExactly("zo" to MentionContext.post("p1"))
        assertThat(mentions.state.value.suggestions.map { it.username }).containsExactly("zoe")
    }

    @Test
    fun `from the third character the server answer follows the local matches, without the caller`() = runTest {
        val search = RecordingSearch { listOf(person("annie"), person("anna"), person("ann-me", id = "me")) }
        val mentions = autocomplete(search, FixedContacts(listOf(person("anna"))))
        mentions.bind(MentionContext.post("p1"))
        advanceUntilIdle()

        mentions.onTextChange("@ann")
        assertThat(mentions.state.value.suggestions.map { it.username }).containsExactly("anna")
        advanceUntilIdle()

        assertThat(mentions.state.value.suggestions.map { it.username }).containsExactly("anna", "annie").inOrder()
    }

    @Test
    fun `an answer for a fragment the user has left is dropped`() = runTest {
        val search = RecordingSearch { query -> listOf(person("x-$query")) }
        val mentions = autocomplete(search)
        mentions.bind(MentionContext.post("p1"))

        mentions.onTextChange("@car")
        mentions.onTextChange("@dan")
        advanceUntilIdle()

        assertThat(search.asked.map { it.first }).containsExactly("dan")
        assertThat(mentions.state.value.suggestions.map { it.username }).containsExactly("x-dan")
    }

    @Test
    fun `a members-only conversation never offers a contact who is not a member`() = runTest {
        val search = RecordingSearch()
        val driverState = MentionAutocomplete(
            scope = this,
            search = search,
            contacts = FixedContacts(listOf(person("anna"), person("andre"))),
            selfId = { "me" },
        )
        driverState.bind(MentionContext.conversation("c1", "group", isMember = true))
        advanceUntilIdle()

        driverState.onTextChange("@a")

        assertThat(driverState.state.value.suggestions).isEmpty()
    }

    @Test
    fun `before any context is bound, nothing is offered and nothing is asked (#14071)`() = runTest {
        val search = RecordingSearch()
        val mentions = autocomplete(search, contacts = FixedContacts(listOf(person("anna"))))
        mentions.bind(null)
        advanceUntilIdle()

        mentions.onTextChange("@ann")
        advanceUntilIdle()

        assertThat(mentions.state.value.suggestions).isEmpty()
        assertThat(search.asked).isEmpty()
    }

    @Test
    fun `a conversation of unknown type offers nobody and asks the network nothing (#14071)`() = runTest {
        val search = RecordingSearch()
        val mentions = autocomplete(search, contacts = FixedContacts(listOf(person("anna"))))
        mentions.bind(MentionContext.conversation("c1", "mystery", isMember = true))
        advanceUntilIdle()

        mentions.onTextChange("@ann")
        advanceUntilIdle()

        assertThat(mentions.state.value.suggestions).isEmpty()
        assertThat(search.asked).isEmpty()
    }

    @Test
    fun `a reply into a DM offers the interlocutor of the roster alone, without the network (#14071)`() = runTest {
        val search = RecordingSearch()
        val mentions = autocomplete(search, contacts = FixedContacts(listOf(person("anna"))))
        mentions.updateRoster(listOf(person("annie")))
        mentions.bind(MentionContext.interlocutor("u-annie"))
        advanceUntilIdle()

        mentions.onTextChange("@ann")
        advanceUntilIdle()

        assertThat(mentions.state.value.suggestions.map { it.username }).containsExactly("annie")
        assertThat(search.asked).isEmpty()
    }

    @Test
    fun `selecting inserts the handle, closes the panel and keeps the draft mention`() = runTest {
        val mentions = autocomplete(RecordingSearch(), FixedContacts(listOf(person("anna"))))
        mentions.bind(null)
        advanceUntilIdle()
        mentions.onTextChange("hello @an")

        val text = mentions.select(person("anna"), "hello @an")

        assertThat(text).isEqualTo("hello @anna ")
        assertThat(mentions.state.value.isActive).isFalse()
        assertThat(mentions.state.value.draftMentions).containsKey("anna")
    }

    @Test
    fun `contacts landing after the at sign join the open panel ahead of what it shows`() = runTest {
        val contacts = FixedContacts(listOf(person("anna")))
        val mentions = autocomplete(RecordingSearch(), contacts)

        mentions.onTextChange("@a")
        mentions.bind(MentionContext.post("p1"))
        advanceUntilIdle()

        assertThat(mentions.state.value.suggestions.map { it.username }).containsExactly("anna")
        assertThat(contacts.refreshes).isEqualTo(1)
    }

    @Test
    fun `binding the same context again does not re-read the cache`() = runTest {
        val contacts = FixedContacts(emptyList())
        val mentions = autocomplete(RecordingSearch(), contacts)

        mentions.bind(MentionContext.post("p1"))
        mentions.bind(MentionContext.post("p1"))
        advanceUntilIdle()

        assertThat(contacts.refreshes).isEqualTo(1)
    }
}
