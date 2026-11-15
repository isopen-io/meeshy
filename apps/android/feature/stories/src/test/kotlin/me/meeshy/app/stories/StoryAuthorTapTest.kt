package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryViewer
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.profile.ofAuthor
import org.junit.Test

class StoryAuthorTapTest {
    @Test
    fun `le lecteur se fige pendant la fiche et reprend a sa fermeture`() {
        assertThat(StoryViewerCover(profile = true).freezesPlayback).isTrue()
        assertThat(StoryViewerCover(profile = false).freezesPlayback).isFalse()
    }

    @Test
    fun `l auteur d une story sans identifiant n est pas cliquable`() {
        assertThat(ProfileSheetUser.ofAuthor(userId = null, displayName = null)).isNull()
    }

    @Test
    fun `une vue de story ouvre la fiche de son spectateur`() {
        val viewer = StoryViewer(id = "u7", username = "eve", displayName = "Eve", avatarUrl = null, viewedAt = null, reactionEmoji = null)
        val user = ProfileSheetUser.ofAuthor(viewer.id, viewer.username, viewer.displayName, viewer.avatarUrl)!!
        assertThat(user.id).isEqualTo("u7")
        assertThat(user.username).isEqualTo("eve")
    }
}
