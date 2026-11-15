package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostMenuPolicyTest {

    private fun entries(
        isAuthor: Boolean = false,
        role: String? = null,
        type: String? = null,
        hasText: Boolean = true,
        bookmarked: Boolean = false,
        media: Boolean = false,
        open: Boolean = false,
        editable: Boolean = false,
        location: Boolean = false,
    ) = PostMenuPolicy.entries(
        PostMenuContext(
            isAuthor = isAuthor, viewerRole = role, postType = type, hasText = hasText, isBookmarked = bookmarked,
            hasSaveableMedia = media, canOpen = open, editable = editable, hasLocation = location,
        ),
    )

    @Test
    fun `someone else's post offers the ordinary actions then report, never pin edit or delete`() {
        assertThat(entries()).containsExactly(
            PostMenuEntry.Share, PostMenuEntry.CopyLink, PostMenuEntry.CopyText, PostMenuEntry.Repost,
            PostMenuEntry.Quote, PostMenuEntry.Bookmark, PostMenuEntry.Report,
        ).inOrder()
    }

    @Test
    fun `your own post offers pin edit then delete last, and no report`() {
        val own = entries(isAuthor = true, editable = true, open = true)
        assertThat(own.takeLast(3)).containsExactly(PostMenuEntry.Pin, PostMenuEntry.Edit, PostMenuEntry.Delete).inOrder()
        assertThat(own.first()).isEqualTo(PostMenuEntry.Open)
        assertThat(own).doesNotContain(PostMenuEntry.Report)
    }

    @Test
    fun `edit needs a host that can reopen the composer`() {
        assertThat(entries(isAuthor = true, editable = false)).doesNotContain(PostMenuEntry.Edit)
    }

    @Test
    fun `a story or a status can be neither pinned nor edited by its author`() {
        listOf("STORY", "status").forEach { type ->
            val own = entries(isAuthor = true, type = type, editable = true)
            assertThat(own).containsNoneOf(PostMenuEntry.Pin, PostMenuEntry.Edit)
            assertThat(own).contains(PostMenuEntry.Delete)
        }
    }

    @Test
    fun `a reel and a post are pinnable by their author`() {
        listOf("REEL", "POST", null).forEach { assertThat(entries(isAuthor = true, type = it)).contains(PostMenuEntry.Pin) }
    }

    @Test
    fun `the viewers list is offered to ADMIN and BIGBOSS only, even on someone else's post`() {
        assertThat(entries(role = "ADMIN")).contains(PostMenuEntry.ViewViewers)
        assertThat(entries(role = "bigboss")).contains(PostMenuEntry.ViewViewers)
        assertThat(entries(role = "MODERATOR")).doesNotContain(PostMenuEntry.ViewViewers)
        assertThat(entries(isAuthor = true, role = "USER")).doesNotContain(PostMenuEntry.ViewViewers)
    }

    @Test
    fun `an admin still reports content that is not his own`() {
        assertThat(entries(role = "ADMIN")).contains(PostMenuEntry.Report)
        assertThat(entries(role = "ADMIN")).doesNotContain(PostMenuEntry.Delete)
    }

    @Test
    fun `saving the media joins the bookmark entry and bookmark flips to unbookmark, never both`() {
        val saved = entries(bookmarked = true, media = true)
        assertThat(saved).contains(PostMenuEntry.Unbookmark)
        assertThat(saved).doesNotContain(PostMenuEntry.Bookmark)
        assertThat(saved).contains(PostMenuEntry.SaveMedia)
        assertThat(entries(media = false)).doesNotContain(PostMenuEntry.SaveMedia)
    }

    @Test
    fun `copy text disappears without text and near here needs a location`() {
        assertThat(entries(hasText = false)).doesNotContain(PostMenuEntry.CopyText)
        assertThat(entries(location = true)).contains(PostMenuEntry.NearHere)
        assertThat(entries(location = false)).doesNotContain(PostMenuEntry.NearHere)
    }

    @Test
    fun `moderation never precedes an ordinary action`() {
        val others = entries(location = true, media = true)
        assertThat(others.last()).isEqualTo(PostMenuEntry.Report)
    }

    private fun pending(open: Boolean, hasText: Boolean = true, retry: Boolean = false, reopen: Boolean = false) = PostMenuPolicy.entries(
        PostMenuContext(
            isAuthor = true, hasText = hasText, canOpen = open, editable = true, hasSaveableMedia = true, hasLocation = true,
            pendingSend = PendingSendMenu(canRetry = retry, canReopen = reopen),
        ),
    )

    @Test
    fun `a card still on its way offers open, copy and cancel sending, nothing that needs the server`() {
        assertThat(pending(open = true)).containsExactly(
            PostMenuEntry.Open, PostMenuEntry.CopyText, PostMenuEntry.CancelSend,
        ).inOrder()
        assertThat(pending(open = true, hasText = false)).containsExactly(PostMenuEntry.Open, PostMenuEntry.CancelSend).inOrder()
    }

    @Test
    fun `a card that gave up offers retry and reopen before cancel sending`() {
        assertThat(pending(open = true, retry = true, reopen = true)).containsExactly(
            PostMenuEntry.Open, PostMenuEntry.CopyText, PostMenuEntry.RetrySend, PostMenuEntry.ReopenSend, PostMenuEntry.CancelSend,
        ).inOrder()
    }

    @Test
    fun `the detail of a publication still on its way offers cancel sending alone`() {
        assertThat(pending(open = false, retry = true, reopen = true)).containsExactly(PostMenuEntry.CancelSend)
    }
}
