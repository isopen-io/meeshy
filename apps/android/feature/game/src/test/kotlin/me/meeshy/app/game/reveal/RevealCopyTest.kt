package me.meeshy.app.game.reveal

import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import com.google.common.truth.Truth.assertThat
import java.util.Locale
import me.meeshy.sdk.model.game.engagement.AchievementCatalog
import me.meeshy.sdk.model.game.engagement.EngagementAchievementKey
import me.meeshy.sdk.model.game.engagement.EngagementAxisKey
import me.meeshy.sdk.model.game.engagement.EngagementReveal
import me.meeshy.sdk.model.game.engagement.EngagementRevealPlan
import me.meeshy.sdk.model.game.engagement.RevealBanner
import me.meeshy.sdk.model.game.engagement.RevealOccasion
import me.meeshy.sdk.model.game.engagement.RevealTitle
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RevealCopyTest {

    private fun resourcesIn(tag: String): Resources {
        val base = RuntimeEnvironment.getApplication() as Context
        val configuration = Configuration(base.resources.configuration).apply { setLocale(Locale.forLanguageTag(tag)) }
        return base.createConfigurationContext(configuration).resources
    }

    private fun family(id: String) = AchievementCatalog.families.first { it.id == id }

    private fun title(tag: String, title: RevealTitle) = RevealCopy.title(resourcesIn(tag), Locale.forLanguageTag(tag), title)

    @Test
    fun `the volume of a composed achievement is written in the reader's locale and agrees at one`() {
        assertThat(title("fr", RevealTitle.Composed(family("message.send.count"), 1000))).isEqualTo("1 000 messages envoyés")
        assertThat(title("en", RevealTitle.Composed(family("message.send.count"), 1000))).isEqualTo("1,000 messages sent")
        assertThat(title("fr", RevealTitle.Composed(family("message.send.count"), 1))).isEqualTo("1 message envoyé")
        assertThat(title("fr", RevealTitle.Composed(family("conversation.join.size"), 100))).isEqualTo("Conversation de 100 membres")
    }

    @Test
    fun `a family with no template falls back on its section title, never on the technical key`() {
        val unknown = family("message.send.count").copy(subject = "hologram")

        assertThat(title("fr", RevealTitle.Composed(unknown, 10))).isEqualTo("Parole")
    }

    @Test
    fun `a legacy achievement says its word and its condition`() {
        val res = resourcesIn("fr")
        val plan = EngagementRevealPlan.of(EngagementReveal.Achievement(EngagementAchievementKey.FIRST_VOICE), RevealOccasion.Celebration)

        assertThat(RevealCopy.title(res, Locale.FRENCH, plan.title)).isEqualTo("Première voix")
        assertThat(RevealCopy.subtitle(res, plan.subtitle)).isEqualTo("Un premier message ou commentaire vocal")
        assertThat(RevealCopy.banner(res, Locale.FRENCH, plan.banner)).isEqualTo("Succès débloqué")
    }

    @Test
    fun `a badge tier is the threshold then the axis name in the sentence`() {
        assertThat(title("fr", RevealTitle.BadgeTier(EngagementAxisKey.TEXT_MESSAGE, 100))).isEqualTo("100 messages texte")
        assertThat(title("de", RevealTitle.BadgeTier(EngagementAxisKey.FRIENDSHIP, 10))).startsWith("10 ")
        assertThat(title("fr", RevealTitle.UnknownBadgeTier(10))).isEqualTo("Palier 10")
    }

    @Test
    fun `a streak agrees in number and a level names its rank`() {
        assertThat(title("fr", RevealTitle.Streak(7))).isEqualTo("7 jours d’affilée")
        assertThat(title("fr", RevealTitle.Level(4))).isEqualTo("Niveau 4")
    }

    @Test
    fun `an obtained date is spoken in full, and an unreadable one just says obtained`() {
        val res = resourcesIn("fr")

        assertThat(RevealCopy.banner(res, Locale.FRENCH, RevealBanner.ObtainedOn("2026-09-03T10:00:00Z"))).startsWith("Obtenu le 3 septembre 2026")
        assertThat(RevealCopy.banner(res, Locale.FRENCH, RevealBanner.ObtainedOn("pas une date"))).isEqualTo("Succès obtenu")
        assertThat(RevealCopy.banner(res, Locale.FRENCH, RevealBanner.Locked)).isEqualTo("Succès à débloquer")
    }

    @Test
    fun `every axis and every family of the catalog has its words in the seven languages`() {
        val tags = listOf("fr", "en", "ar", "de", "es", "it", "pt")
        tags.forEach { tag ->
            val res = resourcesIn(tag)
            EngagementAxisKey.entries.forEach { axis ->
                assertThat(title(tag, RevealTitle.BadgeTier(axis, 10))).doesNotContain("progression_")
            }
            AchievementCatalog.families.forEach { family ->
                family.tiers.forEach { tier ->
                    assertThat(RevealCopy.title(res, Locale.forLanguageTag(tag), RevealTitle.Composed(family, tier))).isNotEmpty()
                }
            }
        }
    }
}
