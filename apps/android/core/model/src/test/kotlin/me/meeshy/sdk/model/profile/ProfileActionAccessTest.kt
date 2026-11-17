package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.relation.RelationLevel
import org.junit.Test

class ProfileActionAccessTest {
    private fun access(level: RelationLevel, action: ProfileRelationAction) = ProfileActionAccess.of(level, action)

    @Test
    fun `a stranger can ask to write and can ring, everything else is shown locked with its circle`() {
        val level = RelationLevel.PUBLIC
        assertThat(access(level, ProfileRelationAction.WRITE)).isEqualTo(ProfileActionAccess.Offered(writeAsRequest = true))
        assertThat(access(level, ProfileRelationAction.CALL)).isEqualTo(ProfileActionAccess.Offered())
        assertThat(access(level, ProfileRelationAction.VIDEO)).isEqualTo(ProfileActionAccess.Offered())
        assertThat(access(level, ProfileRelationAction.BRING)).isEqualTo(ProfileActionAccess.Locked(RelationLevel.FRIEND))
        assertThat(access(level, ProfileRelationAction.LOCATION)).isEqualTo(ProfileActionAccess.Locked(RelationLevel.FRIEND))
        assertThat(access(level, ProfileRelationAction.TALKIE)).isEqualTo(ProfileActionAccess.Locked(RelationLevel.CLOSE))
        assertThat(access(level, ProfileRelationAction.BATTERY)).isEqualTo(ProfileActionAccess.Locked(RelationLevel.CLOSE))
        assertThat(access(level, ProfileRelationAction.UNREACHABLE)).isEqualTo(ProfileActionAccess.Locked(RelationLevel.CLOSE))
    }

    @Test
    fun `from Connaissance on, writing is direct and no longer a request`() {
        assertThat(access(RelationLevel.ACQUAINTANCE, ProfileRelationAction.WRITE)).isEqualTo(ProfileActionAccess.Offered(writeAsRequest = false))
        assertThat(access(RelationLevel.COMMUNITY, ProfileRelationAction.WRITE)).isEqualTo(ProfileActionAccess.Offered(writeAsRequest = true))
    }

    @Test
    fun `a friend opens Bring and the temporary position but not the Talkie`() {
        val level = RelationLevel.FRIEND
        assertThat(access(level, ProfileRelationAction.BRING)).isEqualTo(ProfileActionAccess.Offered())
        assertThat(access(level, ProfileRelationAction.LOCATION)).isEqualTo(ProfileActionAccess.Offered())
        assertThat(access(level, ProfileRelationAction.TALKIE)).isEqualTo(ProfileActionAccess.Locked(RelationLevel.CLOSE))
    }

    @Test
    fun `a close person opens the Talkie, the battery and the unreachable alert`() {
        val level = RelationLevel.CLOSE
        listOf(ProfileRelationAction.TALKIE, ProfileRelationAction.BATTERY, ProfileRelationAction.UNREACHABLE)
            .forEach { assertThat(access(level, it)).isEqualTo(ProfileActionAccess.Offered()) }
    }

    @Test
    fun `the whole plan lists every action once, in the order of the face`() {
        val plan = ProfileActionAccess.plan(RelationLevel.PUBLIC)
        assertThat(plan.map { it.first }).containsExactlyElementsIn(ProfileRelationAction.entries).inOrder()
        assertThat(plan.map { it.first }).containsNoDuplicates()
    }

    @Test
    fun `a locked row carries the circle that opens it and nothing else`() {
        val locked = access(RelationLevel.PUBLIC, ProfileRelationAction.TALKIE) as ProfileActionAccess.Locked
        assertThat(ProfileActionAccess.Locked::class.java.declaredFields.filterNot { it.isSynthetic || it.name == "Companion" }.map { it.name })
            .containsExactly("opensAt")
        assertThat(locked.opensAt).isEqualTo(RelationLevel.CLOSE)
    }

    @Test
    fun `the level served for the circle tools wins over the link, so a teammate's tools are not shown locked`() {
        assertThat(ProfileActionAccess.levelFor(linkLevel = RelationLevel.ACQUAINTANCE, toolLevel = RelationLevel.BLOOD, awaitingLink = false))
            .isEqualTo(RelationLevel.BLOOD)
        assertThat(ProfileActionAccess.levelFor(linkLevel = null, toolLevel = RelationLevel.BLOOD, awaitingLink = true))
            .isEqualTo(RelationLevel.BLOOD)
    }

    @Test
    fun `without a served tool level the link decides`() {
        assertThat(ProfileActionAccess.levelFor(linkLevel = RelationLevel.FRIEND, toolLevel = null, awaitingLink = false))
            .isEqualTo(RelationLevel.FRIEND)
    }

    @Test
    fun `with neither, a stranger reads Public and a connected person whose link is not there yet reads unknown`() {
        assertThat(ProfileActionAccess.levelFor(linkLevel = null, toolLevel = null, awaitingLink = false)).isEqualTo(RelationLevel.PUBLIC)
        assertThat(ProfileActionAccess.levelFor(linkLevel = null, toolLevel = null, awaitingLink = true)).isNull()
    }
}
