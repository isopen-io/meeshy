package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiRepostOf
import org.junit.Test

class RepostCommandTest {

    // --- target id resolution (port of iOS resolveRepostTargetId) ---

    @Test
    fun `an original post reposts with its own id`() {
        val cmd = RepostCommand.of("p1", repostOf = null, quote = false, commentary = null)
        assertThat(cmd.targetId).isEqualTo("p1")
    }

    @Test
    fun `reposting a repost targets its recorded root, not the intermediate share`() {
        val repostOf = ApiRepostOf(id = "share1", originalRepostOfId = "root99")
        val cmd = RepostCommand.of("p1", repostOf = repostOf, quote = false, commentary = null)
        assertThat(cmd.targetId).isEqualTo("root99")
    }

    @Test
    fun `reposting a repost with no recorded root falls back to the reposted id`() {
        val repostOf = ApiRepostOf(id = "share1", originalRepostOfId = null)
        val cmd = RepostCommand.of("p1", repostOf = repostOf, quote = false, commentary = null)
        assertThat(cmd.targetId).isEqualTo("share1")
    }

    @Test
    fun `a blank recorded root falls back to the reposted id`() {
        val repostOf = ApiRepostOf(id = "share1", originalRepostOfId = "   ")
        val cmd = RepostCommand.of("p1", repostOf = repostOf, quote = false, commentary = null)
        assertThat(cmd.targetId).isEqualTo("share1")
    }

    @Test
    fun `a padded recorded root is trimmed`() {
        val repostOf = ApiRepostOf(id = "share1", originalRepostOfId = "  root99  ")
        val cmd = RepostCommand.of("p1", repostOf = repostOf, quote = false, commentary = null)
        assertThat(cmd.targetId).isEqualTo("root99")
    }

    // --- content / isQuote gating (port of iOS repostPost) ---

    @Test
    fun `a simple repost carries no content and is not a quote`() {
        val cmd = RepostCommand.of("p1", repostOf = null, quote = false, commentary = "ignored words")
        assertThat(cmd.content).isNull()
        assertThat(cmd.isQuote).isFalse()
    }

    @Test
    fun `a quote with commentary carries the trimmed content and flags isQuote`() {
        val cmd = RepostCommand.of("p1", repostOf = null, quote = true, commentary = "  great read  ")
        assertThat(cmd.content).isEqualTo("great read")
        assertThat(cmd.isQuote).isTrue()
    }

    @Test
    fun `a quote with blank commentary degrades to a simple repost`() {
        val cmd = RepostCommand.of("p1", repostOf = null, quote = true, commentary = "   ")
        assertThat(cmd.content).isNull()
        assertThat(cmd.isQuote).isFalse()
    }

    @Test
    fun `a quote with null commentary degrades to a simple repost`() {
        val cmd = RepostCommand.of("p1", repostOf = null, quote = true, commentary = null)
        assertThat(cmd.content).isNull()
        assertThat(cmd.isQuote).isFalse()
    }

    @Test
    fun `inner whitespace in a quote is preserved, only the edges are trimmed`() {
        val cmd = RepostCommand.of("p1", repostOf = null, quote = true, commentary = "\tone  two\n")
        assertThat(cmd.content).isEqualTo("one  two")
        assertThat(cmd.isQuote).isTrue()
    }

    // --- both decisions compose ---

    @Test
    fun `a quote of a repost targets the root and still carries commentary`() {
        val repostOf = ApiRepostOf(id = "share1", originalRepostOfId = "root99")
        val cmd = RepostCommand.of("p1", repostOf = repostOf, quote = true, commentary = "worth it")
        assertThat(cmd.targetId).isEqualTo("root99")
        assertThat(cmd.content).isEqualTo("worth it")
        assertThat(cmd.isQuote).isTrue()
    }
}
