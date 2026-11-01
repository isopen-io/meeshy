package me.meeshy.sdk.model.mention

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MentionCandidate
import org.junit.Test

class MentionLookupLawTest {

    private fun person(username: String, displayName: String = username, id: String = "u-$username") =
        MentionCandidate(id = id, username = username, displayName = displayName)

    @Test
    fun `a bare at sign and a single letter stay on the local cache`() {
        assertThat(MentionLookupLaw.stage(query = "", localMatchCount = 0)).isEqualTo(MentionLookupStage.LOCAL)
        assertThat(MentionLookupLaw.stage(query = "a", localMatchCount = 0)).isEqualTo(MentionLookupStage.LOCAL)
    }

    @Test
    fun `two letters stay local while the cache finds someone`() {
        assertThat(MentionLookupLaw.stage(query = "an", localMatchCount = 2)).isEqualTo(MentionLookupStage.LOCAL)
    }

    @Test
    fun `two letters without a local match call the network`() {
        assertThat(MentionLookupLaw.stage(query = "an", localMatchCount = 0)).isEqualTo(MentionLookupStage.REMOTE)
    }

    @Test
    fun `from the third character the network is always called`() {
        assertThat(MentionLookupLaw.stage(query = "ann", localMatchCount = 5)).isEqualTo(MentionLookupStage.REMOTE)
        assertThat(MentionLookupLaw.stage(query = "annabel", localMatchCount = 0)).isEqualTo(MentionLookupStage.REMOTE)
    }

    @Test
    fun `surrounding whitespace does not count`() {
        assertThat(MentionLookupLaw.stage(query = "  a ", localMatchCount = 0)).isEqualTo(MentionLookupStage.LOCAL)
        assertThat(MentionLookupLaw.stage(query = " an ", localMatchCount = 1)).isEqualTo(MentionLookupStage.LOCAL)
    }

    @Test
    fun `the merge keeps the server order after the local matches, without duplicates`() {
        val merged = MentionLookupLaw.merge(
            local = listOf("a", "b"),
            remote = listOf("c", "b", "d"),
            selfId = null,
            id = { it },
        )
        assertThat(merged).containsExactly("a", "b", "c", "d").inOrder()
    }

    @Test
    fun `the merge drops the caller`() {
        val merged = MentionLookupLaw.merge(local = listOf("me"), remote = listOf("x"), selfId = "me", id = { it })
        assertThat(merged).containsExactly("x")
    }

    @Test
    fun `candidates merge by id and by handle, local first, never the caller`() {
        val merged = MentionLookupLaw.mergeCandidates(
            local = listOf(person("bob"), person("me", id = "me")),
            remote = listOf(person("BOB", id = "other-bob"), person("", "Nameless"), person("carol"), person("bob")),
            selfId = "me",
        )
        assertThat(merged.map { it.username }).containsExactly("bob", "carol").inOrder()
    }

    @Test
    fun `a blank query matches everyone and a query matches the handle or the display name`() {
        val roster = listOf(person("bob", "Bob Martin"), person("alice", "Alice Smith"))
        assertThat(MentionLookupLaw.filter(roster, " ")).isEqualTo(roster)
        assertThat(MentionLookupLaw.filter(roster, "MART").map { it.username }).containsExactly("bob")
        assertThat(MentionLookupLaw.filter(roster, "ali").map { it.username }).containsExactly("alice")
        assertThat(MentionLookupLaw.filter(roster, "zed")).isEmpty()
    }

    @Test
    fun `in an open context the contacts come before the people of the context`() {
        val local = MentionLookupLaw.localMatches(
            contacts = listOf(person("anna"), person("bob")),
            context = listOf(person("annie"), person("anna")),
            query = "an",
            selfId = null,
            scope = MentionableScope.DIRECTORY,
        )
        assertThat(local.map { it.username }).containsExactly("anna", "annie").inOrder()
    }

    @Test
    fun `in a members-only context a contact outside the conversation is never offered`() {
        val local = MentionLookupLaw.localMatches(
            contacts = listOf(person("anna"), person("andre")),
            context = listOf(person("annie"), person("andre")),
            query = "an",
            selfId = null,
            scope = MentionableScope.MEMBERS,
        )
        assertThat(local.map { it.username }).containsExactly("andre", "annie").inOrder()
    }

    @Test
    fun `the local matches never offer the caller`() {
        val local = MentionLookupLaw.localMatches(
            contacts = listOf(person("ata", id = "me")),
            context = listOf(person("atlas")),
            query = "at",
            selfId = "me",
            scope = MentionableScope.DIRECTORY,
        )
        assertThat(local.map { it.username }).containsExactly("atlas")
    }

    @Test
    fun `a reply into a DM offers the interlocutor alone, never a contact (#14071)`() {
        val local = MentionLookupLaw.localMatches(
            contacts = listOf(person("anna"), person("andre")),
            context = listOf(person("annie")),
            query = "an",
            selfId = null,
            scope = MentionableScope.INTERLOCUTOR,
        )
        assertThat(local.map { it.username }).containsExactly("annie")
    }

    @Test
    fun `without a scope nobody is offered, not even the context (#14071)`() {
        val local = MentionLookupLaw.localMatches(
            contacts = listOf(person("anna")),
            context = listOf(person("annie")),
            query = "",
            selfId = null,
            scope = null,
        )
        assertThat(local).isEmpty()
    }
}
