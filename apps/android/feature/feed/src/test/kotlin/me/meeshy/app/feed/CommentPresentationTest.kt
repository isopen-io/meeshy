package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPostComment
import org.junit.Test

class CommentPresentationTest {

    private object NoPrefs : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = null
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private fun reply(author: ApiAuthor? = ApiAuthor(id = "u1", username = "al", displayName = "Alice")) =
        CommentProjection.build(
            ApiPostComment(id = "r1", content = "Salut", parentId = "c1", author = author),
            NoPrefs,
            null,
            depth = 1,
        )

    @Test
    fun accessibilityLabel_composesNameRoleContentAndTime() {
        val label = reply().accessibilityLabel("%1\$s, réponse. %2\$s. %3\$s", time = "2 min", unknownAuthor = "?")
        assertThat(label).isEqualTo("Alice, réponse. Salut. 2 min")
    }

    @Test
    fun accessibilityLabel_fallsBackToTheUnknownAuthor() {
        val label = reply(author = null).accessibilityLabel("%1\$s, réponse. %2\$s. %3\$s", time = "1 h", unknownAuthor = "Inconnu")
        assertThat(label).isEqualTo("Inconnu, réponse. Salut. 1 h")
    }

    @Test
    fun accessibilityLabel_acceptsAnArabicOrderOfArguments() {
        val label = reply().accessibilityLabel("%3\$s. %2\$s — %1\$s", time = "t", unknownAuthor = "?")
        assertThat(label).isEqualTo("t. Salut — Alice")
    }

    @Test
    fun build_carriesTheDepthTheHostGives() {
        assertThat(reply().depth).isEqualTo(1)
    }
}
