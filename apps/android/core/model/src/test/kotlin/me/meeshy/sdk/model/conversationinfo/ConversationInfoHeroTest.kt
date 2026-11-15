package me.meeshy.sdk.model.conversationinfo

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import org.junit.Test

/** Le héros de la fiche (iOS `conversationInfoRow`, `muteIndicator`, « Créé le … », bannière). */
class ConversationInfoHeroTest {

    private fun conversation(
        type: String = "group",
        memberCount: Int? = 12,
        capped: Boolean? = null,
        banner: String? = null,
        createdAt: String? = "2026-03-04T10:00:00.000Z",
        muted: Boolean = false,
    ) = ApiConversation(
        id = "c1",
        type = type,
        serverMemberCount = memberCount,
        memberCountCapped = capped,
        banner = banner,
        createdAt = createdAt,
        preferences = ApiConversationPreferences(isMuted = muted),
    )

    @Test
    fun `le nombre de membres vient du serveur`() {
        assertThat(ConversationInfoHero.of(conversation(memberCount = 12)).memberCountLabel).isEqualTo("12")
    }

    @Test
    fun `un effectif plafonne s'affiche avec un plus`() {
        assertThat(ConversationInfoHero.of(conversation(memberCount = 199, capped = true)).memberCountLabel).isEqualTo("199+")
    }

    @Test
    fun `sans membre connu aucune pastille d'effectif`() {
        assertThat(ConversationInfoHero.of(conversation(memberCount = 0)).memberCountLabel).isNull()
    }

    @Test
    fun `la banniere vide n'existe pas`() {
        assertThat(ConversationInfoHero.of(conversation(banner = "")).bannerUrl).isNull()
        assertThat(ConversationInfoHero.of(conversation(banner = "https://x/b.png")).bannerUrl).isEqualTo("https://x/b.png")
    }

    @Test
    fun `un direct n'a pas de banniere meme servie`() {
        val hero = ConversationInfoHero.of(conversation(type = "direct", banner = "https://x/b.png"))
        assertThat(hero.kind.hasHeroBanner).isFalse()
        assertThat(hero.bannerUrl).isNull()
    }

    @Test
    fun `la date de creation est lue sur la ligne`() {
        assertThat(ConversationInfoHero.of(conversation()).createdAtEpochMillis).isEqualTo(1_772_618_400_000L)
        assertThat(ConversationInfoHero.of(conversation(createdAt = null)).createdAtEpochMillis).isNull()
        assertThat(ConversationInfoHero.of(conversation(createdAt = "n'importe quoi")).createdAtEpochMillis).isNull()
    }

    @Test
    fun `le muet suit les preferences de la conversation`() {
        assertThat(ConversationInfoHero.of(conversation(muted = true)).muted).isTrue()
        assertThat(ConversationInfoHero.of(conversation(muted = false)).muted).isFalse()
    }
}
