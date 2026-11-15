package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class PostCommentSettingsTest {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun decode(raw: String): ApiPost = json.decodeFromString(ApiPost.serializer(), raw)

    @Test
    fun `a served post carries its own closure and its source's`() {
        val post = decode(
            """{"id":"p1","type":"POST","commentsDisabled":true,
            "repostOf":{"id":"s1","content":"source","commentsDisabled":true}}""",
        )
        assertThat(post.commentsDisabled).isTrue()
        assertThat(post.repostOf?.commentsDisabled).isTrue()
        assertThat(post.commentsClosed).isTrue()
    }

    @Test
    fun `an older gateway that serves neither key reads as open`() {
        val post = decode("""{"id":"p1","repostOf":{"id":"s1"}}""")
        assertThat(post.commentsDisabled).isFalse()
        assertThat(post.repostOf?.commentsDisabled).isFalse()
        assertThat(post.commentsClosed).isFalse()
    }

    @Test
    fun `a null flag is coerced to open rather than failing the whole page`() {
        assertThat(decode("""{"id":"p1","commentsDisabled":null}""").commentsClosed).isFalse()
    }

    @Test
    fun `a repost inherits the closure of the post it republishes`() {
        val post = decode("""{"id":"p1","commentsDisabled":false,"repostOf":{"id":"s1","commentsDisabled":true}}""")
        assertThat(post.commentsDisabled).isFalse()
        assertThat(post.commentsClosed).isTrue()
    }

    @Test
    fun `the author or a platform moderator may toggle, nobody else`() {
        assertThat(PostCommentSettings.mayToggle(authoredByViewer = true, platformRole = null)).isTrue()
        assertThat(PostCommentSettings.mayToggle(authoredByViewer = false, platformRole = "moderator")).isTrue()
        assertThat(PostCommentSettings.mayToggle(authoredByViewer = false, platformRole = "ADMIN")).isTrue()
        assertThat(PostCommentSettings.mayToggle(authoredByViewer = false, platformRole = "BIGBOSS")).isTrue()
        assertThat(PostCommentSettings.mayToggle(authoredByViewer = false, platformRole = "AUDIT")).isFalse()
        assertThat(PostCommentSettings.mayToggle(authoredByViewer = false, platformRole = "USER")).isFalse()
        assertThat(PostCommentSettings.mayToggle(authoredByViewer = false, platformRole = null)).isFalse()
    }

    @Test
    fun `only the COMMENTS_DISABLED refusal closes the thread`() {
        assertThat(PostCommentSettings.refusesComments("COMMENTS_DISABLED")).isTrue()
        assertThat(PostCommentSettings.refusesComments("FORBIDDEN")).isFalse()
        assertThat(PostCommentSettings.refusesComments(null)).isFalse()
    }

    @Test
    fun `a refused gesture rolls back unless a broadcast already said otherwise`() {
        assertThat(PostCommentSettings.rolledBack(current = true, applied = true, before = false)).isFalse()
        assertThat(PostCommentSettings.rolledBack(current = false, applied = true, before = false)).isFalse()
        assertThat(PostCommentSettings.rolledBack(current = false, applied = false, before = true)).isTrue()
    }

    @Test
    fun `a story is closed by itself or by its source`() {
        assertThat(StoryItem(id = "s").commentsClosed).isFalse()
        assertThat(StoryItem(id = "s", commentsDisabled = true).commentsClosed).isTrue()
        assertThat(StoryItem(id = "s", sourceCommentsDisabled = true).commentsClosed).isTrue()
    }

    private fun menu(isAuthor: Boolean, role: String? = null, disabled: Boolean = false, wired: Boolean = true) =
        PostMenuPolicy.entries(
            PostMenuContext(isAuthor = isAuthor, viewerRole = role, commentsDisabled = disabled, canToggleComments = wired),
        )

    @Test
    fun `the author is offered to disable comments, before delete`() {
        val own = menu(isAuthor = true)
        assertThat(own).contains(PostMenuEntry.DisableComments)
        assertThat(own).doesNotContain(PostMenuEntry.EnableComments)
        assertThat(own.indexOf(PostMenuEntry.DisableComments)).isLessThan(own.indexOf(PostMenuEntry.Delete))
    }

    @Test
    fun `closed comments are offered to be reopened`() {
        val own = menu(isAuthor = true, disabled = true)
        assertThat(own).contains(PostMenuEntry.EnableComments)
        assertThat(own).doesNotContain(PostMenuEntry.DisableComments)
    }

    @Test
    fun `a platform moderator sees the toggle on someone else's post, before report`() {
        val moderated = menu(isAuthor = false, role = "MODERATOR")
        assertThat(moderated).contains(PostMenuEntry.DisableComments)
        assertThat(moderated.indexOf(PostMenuEntry.DisableComments)).isLessThan(moderated.indexOf(PostMenuEntry.Report))
    }

    @Test
    fun `an ordinary reader never sees the toggle`() {
        val entries = menu(isAuthor = false, role = "USER")
        assertThat(entries).containsNoneOf(PostMenuEntry.DisableComments, PostMenuEntry.EnableComments)
    }

    @Test
    fun `a host that cannot toggle offers no entry, even to the author`() {
        assertThat(menu(isAuthor = true, wired = false)).containsNoneOf(PostMenuEntry.DisableComments, PostMenuEntry.EnableComments)
    }

    @Test
    fun `the comment overflow leaves Imager to the actions rail`() {
        val actions = listOf(CommentMenuAction.COPY, CommentMenuAction.IMAGINE, CommentMenuAction.REPORT)
        assertThat(CommentMenuPolicy.overflow(actions)).containsExactly(CommentMenuAction.COPY, CommentMenuAction.REPORT).inOrder()
    }

    @Test
    fun `the reel menu offers the toggle to its author before delete and to a moderator before report`() {
        val own = ReelMenu.actions(isOwn = true, hasText = false, canToggleComments = true)
        assertThat(own.takeLast(2)).containsExactly(ReelMenu.Action.DISABLE_COMMENTS, ReelMenu.Action.DELETE).inOrder()
        val moderated = ReelMenu.actions(isOwn = false, hasText = false, viewerRole = "ADMIN", commentsDisabled = true, canToggleComments = true)
        assertThat(moderated.takeLast(2)).containsExactly(ReelMenu.Action.ENABLE_COMMENTS, ReelMenu.Action.REPORT).inOrder()
        assertThat(ReelMenu.actions(isOwn = false, hasText = false, viewerRole = "USER", canToggleComments = true))
            .containsNoneOf(ReelMenu.Action.DISABLE_COMMENTS, ReelMenu.Action.ENABLE_COMMENTS)
        assertThat(ReelMenu.actions(isOwn = true, hasText = false)).containsNoneOf(ReelMenu.Action.DISABLE_COMMENTS, ReelMenu.Action.ENABLE_COMMENTS)
    }

    @Test
    fun `the story menu places the toggle before delete for the author and before remove for moderation`() {
        val own = me.meeshy.sdk.model.story.StoryOptionsMenuPlan.resolve(
            hasStory = true, isOwnStory = true, hasAudioTranscript = false, canCompose = false, canToggleComments = true,
        ).entries
        assertThat(own.indexOf(me.meeshy.sdk.model.story.StoryOptionsMenuEntry.ToggleComments))
            .isEqualTo(own.indexOf(me.meeshy.sdk.model.story.StoryOptionsMenuEntry.Delete) - 1)
        val moderated = me.meeshy.sdk.model.story.StoryOptionsMenuPlan.resolve(
            hasStory = true, isOwnStory = false, hasAudioTranscript = false, canCompose = false, canRemove = true, canToggleComments = true,
        ).entries
        assertThat(moderated.indexOf(me.meeshy.sdk.model.story.StoryOptionsMenuEntry.ToggleComments))
            .isEqualTo(moderated.indexOf(me.meeshy.sdk.model.story.StoryOptionsMenuEntry.Remove) - 1)
        val untouched = me.meeshy.sdk.model.story.StoryOptionsMenuPlan.resolve(
            hasStory = true, isOwnStory = true, hasAudioTranscript = false, canCompose = false,
        ).entries
        assertThat(untouched).doesNotContain(me.meeshy.sdk.model.story.StoryOptionsMenuEntry.ToggleComments)
    }
}
