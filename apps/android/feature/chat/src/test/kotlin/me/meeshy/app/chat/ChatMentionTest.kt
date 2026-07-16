package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MentionCandidate
import org.junit.Test

class ChatMentionTest {

    private fun candidate(username: String, displayName: String = username) =
        MentionCandidate(id = "u-$username", username = username, displayName = displayName)

    private val roster = listOf(
        candidate("bob", "Bob Martin"),
        candidate("alice", "Alice Smith"),
        candidate("bobby", "Bobby Tables"),
    )

    // --- extractQuery ---

    @Test
    fun `extractQuery is null when there is no at sign`() {
        assertThat(ChatMention.extractQuery("hello there")).isNull()
    }

    @Test
    fun `extractQuery returns the trailing fragment after the last at sign`() {
        assertThat(ChatMention.extractQuery("hey @bo")).isEqualTo("bo")
    }

    @Test
    fun `extractQuery returns an empty string for a bare at sign`() {
        assertThat(ChatMention.extractQuery("hey @")).isEqualTo("")
    }

    @Test
    fun `extractQuery is null when a space follows the last at sign`() {
        assertThat(ChatMention.extractQuery("hey @bob smith")).isNull()
    }

    @Test
    fun `extractQuery is null when the mention was already completed with a trailing space`() {
        assertThat(ChatMention.extractQuery("hey @bob ")).isNull()
    }

    @Test
    fun `extractQuery uses the fragment past the last at sign when several are present`() {
        assertThat(ChatMention.extractQuery("@bob hi @al")).isEqualTo("al")
    }

    @Test
    fun `extractQuery treats an at sign glued to a word as a mention`() {
        assertThat(ChatMention.extractQuery("a@b")).isEqualTo("b")
    }

    // --- filterCandidates ---

    @Test
    fun `filterCandidates returns every candidate for a blank query`() {
        assertThat(ChatMention.filterCandidates(roster, "")).isEqualTo(roster)
    }

    @Test
    fun `filterCandidates returns every candidate for a whitespace-only query`() {
        assertThat(ChatMention.filterCandidates(roster, "   ")).isEqualTo(roster)
    }

    @Test
    fun `filterCandidates matches the username case-insensitively`() {
        assertThat(ChatMention.filterCandidates(roster, "BO").map { it.username })
            .containsExactly("bob", "bobby").inOrder()
    }

    @Test
    fun `filterCandidates matches the display name`() {
        assertThat(ChatMention.filterCandidates(roster, "smith").map { it.username })
            .containsExactly("alice")
    }

    @Test
    fun `filterCandidates returns empty when nothing matches`() {
        assertThat(ChatMention.filterCandidates(roster, "zzz")).isEmpty()
    }

    @Test
    fun `filterCandidates on an empty roster is empty`() {
        assertThat(ChatMention.filterCandidates(emptyList(), "bob")).isEmpty()
    }

    // --- insertMention ---

    @Test
    fun `insertMention replaces the trailing fragment with the handle plus a space`() {
        assertThat(ChatMention.insertMention(candidate("bob"), "hey @bo")).isEqualTo("hey @bob ")
    }

    @Test
    fun `insertMention expands a bare at sign into the handle`() {
        assertThat(ChatMention.insertMention(candidate("bob"), "@")).isEqualTo("@bob ")
    }

    @Test
    fun `insertMention leaves text without an at sign unchanged`() {
        assertThat(ChatMention.insertMention(candidate("bob"), "no mention")).isEqualTo("no mention")
    }

    @Test
    fun `insertMention is inert when a space already follows the last at sign`() {
        assertThat(ChatMention.insertMention(candidate("bob"), "hey @done text"))
            .isEqualTo("hey @done text")
    }

    @Test
    fun `insertMention preserves text before the mention`() {
        assertThat(ChatMention.insertMention(candidate("alice"), "cc @bob and @al"))
            .isEqualTo("cc @bob and @alice ")
    }

    // --- onTextChange reducer ---

    @Test
    fun `onTextChange activates with the query and matching suggestions`() {
        val next = MentionAutocompleteState().onTextChange("hey @bo", roster)

        assertThat(next.isActive).isTrue()
        assertThat(next.activeQuery).isEqualTo("bo")
        assertThat(next.suggestions.map { it.username }).containsExactly("bob", "bobby").inOrder()
    }

    @Test
    fun `onTextChange with no mention clears the panel but keeps draft mentions`() {
        val seeded = MentionAutocompleteState(
            activeQuery = "bo",
            suggestions = roster,
            draftMentions = mapOf("bob" to candidate("bob")),
        )

        val next = seeded.onTextChange("hey there", roster)

        assertThat(next.isActive).isFalse()
        assertThat(next.suggestions).isEmpty()
        assertThat(next.draftMentions).containsKey("bob")
    }

    @Test
    fun `onTextChange shows the full roster on a bare at sign`() {
        val next = MentionAutocompleteState().onTextChange("hey @", roster)

        assertThat(next.activeQuery).isEqualTo("")
        assertThat(next.suggestions).isEqualTo(roster)
    }

    // --- cleared reducer ---

    @Test
    fun `cleared returns the same inert state instance when already inert`() {
        val inert = MentionAutocompleteState(draftMentions = mapOf("bob" to candidate("bob")))

        assertThat(inert.cleared()).isSameInstanceAs(inert)
    }

    @Test
    fun `cleared drops the active query and suggestions but preserves draft mentions`() {
        val active = MentionAutocompleteState(
            activeQuery = "bo",
            suggestions = roster,
            draftMentions = mapOf("bob" to candidate("bob")),
        )

        val cleared = active.cleared()

        assertThat(cleared.activeQuery).isNull()
        assertThat(cleared.suggestions).isEmpty()
        assertThat(cleared.draftMentions).containsKey("bob")
    }

    // --- select reducer ---

    @Test
    fun `select rewrites the text, records the draft mention, and dismisses the panel`() {
        val active = MentionAutocompleteState(activeQuery = "bo", suggestions = roster)

        val (text, next) = active.select(candidate("bob", "Bob Martin"), "hey @bo")

        assertThat(text).isEqualTo("hey @bob ")
        assertThat(next.isActive).isFalse()
        assertThat(next.suggestions).isEmpty()
        assertThat(next.draftMentions["bob"]?.displayName).isEqualTo("Bob Martin")
    }

    @Test
    fun `select accumulates multiple draft mentions`() {
        val first = MentionAutocompleteState(activeQuery = "bo", suggestions = roster)
        val (text1, state1) = first.select(candidate("bob"), "@bo")

        val (_, state2) = state1
            .onTextChange("$text1@al", roster)
            .select(candidate("alice"), "$text1@al")

        assertThat(state2.draftMentions.keys).containsExactly("bob", "alice")
    }

    // --- shouldQueryRemote gate ---

    @Test
    fun `shouldQueryRemote is false for a query shorter than two characters`() {
        assertThat(ChatMention.shouldQueryRemote("a")).isFalse()
    }

    @Test
    fun `shouldQueryRemote is false for an empty query`() {
        assertThat(ChatMention.shouldQueryRemote("")).isFalse()
    }

    @Test
    fun `shouldQueryRemote ignores surrounding whitespace when measuring length`() {
        assertThat(ChatMention.shouldQueryRemote("  a  ")).isFalse()
    }

    @Test
    fun `shouldQueryRemote is true from two significant characters`() {
        assertThat(ChatMention.shouldQueryRemote("ab")).isTrue()
    }

    @Test
    fun `shouldQueryRemote trims before measuring a longer query`() {
        assertThat(ChatMention.shouldQueryRemote("  ali  ")).isTrue()
    }

    // --- mergeSuggestions ---

    @Test
    fun `mergeSuggestions keeps locals untouched when there are no remote results`() {
        assertThat(ChatMention.mergeSuggestions(roster, emptyList())).isEqualTo(roster)
    }

    @Test
    fun `mergeSuggestions returns the deduped remote when there are no locals`() {
        val remote = listOf(candidate("carol"), candidate("dave"))
        assertThat(ChatMention.mergeSuggestions(emptyList(), remote).map { it.username })
            .containsExactly("carol", "dave").inOrder()
    }

    @Test
    fun `mergeSuggestions appends remote candidates after the locals in order`() {
        val remote = listOf(candidate("carol"), candidate("dave"))
        assertThat(ChatMention.mergeSuggestions(roster, remote).map { it.username })
            .containsExactly("bob", "alice", "bobby", "carol", "dave").inOrder()
    }

    @Test
    fun `mergeSuggestions drops a remote candidate already present locally`() {
        val remote = listOf(candidate("carol"), candidate("alice", "Alice Remote"))
        assertThat(ChatMention.mergeSuggestions(roster, remote).map { it.username })
            .containsExactly("bob", "alice", "bobby", "carol").inOrder()
    }

    @Test
    fun `mergeSuggestions dedups against locals case-insensitively`() {
        val remote = listOf(candidate("ALICE", "Alice Caps"))
        assertThat(ChatMention.mergeSuggestions(roster, remote).map { it.username })
            .containsExactly("bob", "alice", "bobby").inOrder()
    }

    @Test
    fun `mergeSuggestions collapses duplicates within the remote results`() {
        val remote = listOf(candidate("carol"), candidate("Carol", "Carol Two"))
        assertThat(ChatMention.mergeSuggestions(emptyList(), remote).map { it.displayName })
            .containsExactly("carol").inOrder()
    }

    @Test
    fun `mergeSuggestions drops remote candidates with a blank handle`() {
        val remote = listOf(candidate("", "Nameless"), candidate("carol"))
        assertThat(ChatMention.mergeSuggestions(roster, remote).map { it.username })
            .containsExactly("bob", "alice", "bobby", "carol").inOrder()
    }

    @Test
    fun `mergeSuggestions dedups a remote handle that only differs by surrounding whitespace`() {
        val remote = listOf(candidate(" alice ", "Alice Padded"), candidate("carol"))
        assertThat(ChatMention.mergeSuggestions(roster, remote).map { it.username })
            .containsExactly("bob", "alice", "bobby", "carol").inOrder()
    }

    // --- applyRemote reducer ---

    @Test
    fun `applyRemote merges remote results into the suggestions for the active query`() {
        val active = MentionAutocompleteState(
            activeQuery = "ca",
            suggestions = listOf(candidate("carla")),
        )

        val next = active.applyRemote("ca", listOf(candidate("carol"), candidate("carla")))

        assertThat(next.suggestions.map { it.username }).containsExactly("carla", "carol").inOrder()
    }

    @Test
    fun `applyRemote discards a response whose query no longer matches the active one`() {
        val active = MentionAutocompleteState(
            activeQuery = "carl",
            suggestions = listOf(candidate("carla")),
        )

        val next = active.applyRemote("ca", listOf(candidate("carol")))

        assertThat(next).isSameInstanceAs(active)
    }

    @Test
    fun `applyRemote is inert once the mention panel has been dismissed`() {
        val inert = MentionAutocompleteState(draftMentions = mapOf("bob" to candidate("bob")))

        val next = inert.applyRemote("ca", listOf(candidate("carol")))

        assertThat(next).isSameInstanceAs(inert)
    }

    // --- reset reducer ---

    @Test
    fun `reset clears the panel and the draft mention tracking`() {
        val loaded = MentionAutocompleteState(
            activeQuery = "bo",
            suggestions = roster,
            draftMentions = mapOf("bob" to candidate("bob")),
        )

        val reset = loaded.reset()

        assertThat(reset).isEqualTo(MentionAutocompleteState())
    }
}
