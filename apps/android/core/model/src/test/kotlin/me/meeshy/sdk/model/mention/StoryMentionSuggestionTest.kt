package me.meeshy.sdk.model.mention

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MentionCandidate
import org.junit.Test

/** La mention « @ » d'un commentaire de story : les contacts locaux d'abord, le serveur dès la deuxième lettre sans local. */
class StoryMentionSuggestionTest {

    private fun person(id: String, handle: String) = MentionCandidate(id = id, username = handle, displayName = handle)

    private val story = MentionContext.post("s1")!!
    private val contacts = listOf(person("u1", "alice"), person("u2", "bob"))

    @Test
    fun `a story is a post, so the comment asks the network about its commenters`() {
        assertThat(story.type).isEqualTo(MentionContextType.POST)
        assertThat(story.searchesRemotely).isTrue()
        assertThat(MentionContext.post(" ")).isNull()
    }

    @Test
    fun `the local contacts answer first, before any network call`() {
        val local = MentionLookupLaw.localMatches(contacts, emptyList(), "al", selfId = "me", scope = story.scope)
        assertThat(local.map { it.username }).containsExactly("alice")
        assertThat(MentionLookupLaw.stage("al", local.size)).isEqualTo(MentionLookupStage.LOCAL)
    }

    @Test
    fun `from the second letter the server is asked when no contact matches`() {
        val local = MentionLookupLaw.localMatches(contacts, emptyList(), "zo", selfId = "me", scope = story.scope)
        assertThat(local).isEmpty()
        assertThat(MentionLookupLaw.stage("zo", local.size)).isEqualTo(MentionLookupStage.REMOTE)
    }

    @Test
    fun `the served list keeps the contacts first and never offers the author twice or oneself`() {
        val remote = listOf(person("u1", "alice"), person("me", "moi"), person("u9", "alba"))
        val merged = MentionLookupLaw.mergeCandidates(contacts.filter { it.username.startsWith("al") }, remote, selfId = "me")
        assertThat(merged.map { it.id }).containsExactly("u1", "u9").inOrder()
    }
}
