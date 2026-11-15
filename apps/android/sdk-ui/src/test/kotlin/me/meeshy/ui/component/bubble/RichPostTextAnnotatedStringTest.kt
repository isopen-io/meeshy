package me.meeshy.ui.component.bubble

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.LinkAnnotation
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RichPostTextAnnotatedStringTest {
    private val mention = Color(0xFF111111)
    private val hashtag = Color(0xFF222222)

    private fun build(
        text: String,
        tracked: Map<String, String>? = null,
        valid: Set<String>? = null,
        onHashtag: ((String) -> Unit)? = null,
        onMention: ((String) -> Unit)? = null,
        rainbow: String? = null,
    ) = buildRichAnnotatedString(
        text = text,
        look = RichTextLook(
            color = Color.White,
            mentionColor = mention,
            hashtagColor = hashtag,
            trackedLinks = tracked,
            validUsernames = valid,
            rainbowSeed = rainbow,
        ),
        isDark = true,
        onHashtagClick = onHashtag,
        onMentionClick = onMention,
    )

    @Test
    fun `une adresse suivie affiche l adresse brute et s ouvre par le lien suivi`() {
        val annotated = build("voir https://exemple.com/a", tracked = mapOf("https://exemple.com/a" to "abc123"))
        assertThat(annotated.text).isEqualTo("voir https://exemple.com/a")
        val link = annotated.getLinkAnnotations(0, annotated.length).single().item as LinkAnnotation.Url
        assertThat(link.url).isEqualTo("https://meeshy.me/l/abc123")
    }

    @Test
    fun `la carte url jeton s applique aussi a une adresse entre crochets`() {
        val annotated = build("[doc](https://exemple.com/b)", tracked = mapOf("https://exemple.com/b" to "tok999"))
        assertThat(annotated.text).isEqualTo("doc")
        val link = annotated.getLinkAnnotations(0, annotated.length).single().item as LinkAnnotation.Url
        assertThat(link.url).isEqualTo("https://meeshy.me/l/tok999")
    }

    @Test
    fun `un hashtag remonte son tag a l hote sans ouvrir de lien`() {
        var tapped: String? = null
        val annotated = build("salut #Meeshy", onHashtag = { tapped = it })
        val link = annotated.getLinkAnnotations(0, annotated.length).single().item as LinkAnnotation.Clickable
        link.linkInteractionListener?.onClick(link)
        assertThat(tapped).isEqualTo("meeshy")
    }

    @Test
    fun `une mention valide remonte son pseudo et une mention inconnue reste du texte`() {
        var tapped: String? = null
        val annotated = build("@alice et @bob", valid = setOf("alice"), onMention = { tapped = it })
        val links = annotated.getLinkAnnotations(0, annotated.length)
        assertThat(links).hasSize(1)
        val link = links.single().item as LinkAnnotation.Clickable
        link.linkInteractionListener?.onClick(link)
        assertThat(tapped).isEqualTo("alice")
    }

    @Test
    fun `les mentions et hashtags prennent leurs couleurs`() {
        val annotated = build("@alice #tag")
        val colors = annotated.getLinkAnnotations(0, annotated.length).mapNotNull { it.item.styles?.style?.color }
        assertThat(colors).containsAtLeast(mention, hashtag)
    }

    @Test
    fun `les lettres arc-en-ciel ne colorent jamais un lien`() {
        val annotated = build("ab #tag", rainbow = "msg1")
        val tagStart = annotated.text.indexOf('#')
        val tagColors = annotated.spanStyles.filter { it.start >= tagStart }.map { it.item.color }
        assertThat(tagColors).doesNotContain(Color.White)
        assertThat(annotated.spanStyles.count { it.end <= tagStart && it.item.color != Color.White }).isAtLeast(2)
    }

    @Test
    fun `les titres grossissent par niveau`() {
        assertThat(headingScale(1)).isGreaterThan(headingScale(2))
        assertThat(headingScale(2)).isGreaterThan(headingScale(3))
        assertThat(headingScale(3)).isGreaterThan(1f)
    }
}
