package me.meeshy.sdk.model.text

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PlainTextTest {

    @Test fun `emphasis markers disappear`() {
        assertThat(PlainText.of("un **gras** et ***fort*** et ~~barré~~")).isEqualTo("un gras et fort et barré")
    }

    @Test fun `a markdown link keeps its label only`() {
        assertThat(PlainText.of("voir [le doc](https://x.fr/a) ici")).isEqualTo("voir le doc ici")
    }

    @Test fun `blocks lose their markers`() {
        assertThat(PlainText.of("# Titre\n- a\n- **b**\n> cité")).isEqualTo("Titre\na\nb\ncité")
    }

    @Test fun `code is literal`() {
        assertThat(PlainText.of("```\n**x**\n```")).isEqualTo("**x**")
        assertThat(PlainText.of("le `**x**` reste")).isEqualTo("le **x** reste")
    }

    @Test fun `mentions and hashtags keep their display`() {
        assertThat(PlainText.of("@ata voit #Paris")).isEqualTo("@ata voit #Paris")
    }

    @Test fun `a short code and a bare url show as written`() {
        assertThat(PlainText.of("m+abc et https://x.fr/a")).isEqualTo("m+abc et https://x.fr/a")
    }

    @Test fun `empty stays empty`() {
        assertThat(PlainText.of("")).isEmpty()
    }
}
