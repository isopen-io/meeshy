package me.meeshy.app.game

import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import com.google.common.truth.Truth.assertThat
import java.util.Locale
import me.meeshy.sdk.model.game.engagement.AchievementCatalog
import me.meeshy.sdk.model.game.engagement.AchievementFamily
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AchievementCopyTest {

    private fun resourcesIn(tag: String): Resources {
        val base = RuntimeEnvironment.getApplication() as Context
        val configuration = Configuration(base.resources.configuration).apply { setLocale(Locale.forLanguageTag(tag)) }
        return base.createConfigurationContext(configuration).resources
    }

    private fun family(id: String) = AchievementCatalog.families.first { it.id == id }

    private fun label(tag: String, family: AchievementFamily, tier: Int) =
        AchievementCopy.label(resourcesIn(tag), Locale.forLanguageTag(tag), family, tier)

    @Test
    fun `le palier 1 d une famille de volume s accorde au singulier`() {
        assertThat(label("fr", family("message.send.count"), 1)).isEqualTo("1 message envoyé")
        assertThat(label("en", family("message.send.count"), 1)).isEqualTo("1 message sent")
        assertThat(label("fr", family("message.send.count"), 10)).isEqualTo("10 messages envoyés")
    }

    @Test
    fun `le nombre suit la locale du lecteur`() {
        assertThat(label("en", family("message.send.count"), 1000)).isEqualTo("1,000 messages sent")
        assertThat(label("fr", family("message.send.count"), 1000)).isEqualTo("1\u202F000 messages envoyés")
        assertThat(label("ar", family("message.send.count"), 1000)).isNotEmpty()
    }

    @Test
    fun `une famille d ampleur garde son gabarit de section`() {
        assertThat(label("fr", family("conversation.join.size"), 100)).isEqualTo("Conversation de 100 membres")
    }

    @Test
    fun `une famille hors catalogue rend null et jamais une cle technique`() {
        val unknown = family("message.send.count").copy(subject = "hologram")

        assertThat(AchievementCopy.knows(unknown)).isFalse()
        assertThat(label("fr", unknown, 10)).isNull()
    }

    @Test
    fun `chaque famille du catalogue a ses mots dans les sept langues`() {
        listOf("fr", "en", "es", "pt", "de", "it", "ar").forEach { tag ->
            AchievementCatalog.families.forEach { family ->
                family.tiers.forEach { tier -> assertThat(label(tag, family, tier)).isNotEmpty() }
            }
        }
    }
}
