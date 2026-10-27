package me.meeshy.sdk.model.text

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageSegment
import me.meeshy.sdk.model.MessageTextParser
import org.junit.Test

class HashtagLinkTest {

    @Test fun `le lien produit par le parseur rend son tag`() {
        val link = MessageTextParser.parse("salut #Voyage ici").filterIsInstance<MessageSegment.HashtagLink>().single()
        assertThat(HashtagLink.tagFrom(link.url)).isEqualTo("voyage")
    }

    @Test fun `un lien web ordinaire n'est pas un hashtag`() {
        assertThat(HashtagLink.tagFrom("https://meeshy.me/u/alice")).isNull()
        assertThat(HashtagLink.tagFrom("https://exemple.fr/hashtag/x")).isNull()
    }

    @Test fun `un tag vide ou un chemin profond n'ouvre rien`() {
        assertThat(HashtagLink.tagFrom("https://meeshy.me/hashtag/")).isNull()
        assertThat(HashtagLink.tagFrom("https://meeshy.me/hashtag/a/b")).isNull()
    }

    @Test fun `requete et ancre sont ignorees`() {
        assertThat(HashtagLink.tagFrom("https://meeshy.me/hashtag/Paris?ref=1")).isEqualTo("paris")
    }
}
