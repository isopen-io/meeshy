package me.meeshy.app.game.reveal

import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import com.google.common.truth.Truth.assertThat
import java.io.File
import java.util.Locale
import me.meeshy.sdk.model.game.AchievementRarity
import me.meeshy.sdk.model.game.engagement.RarityBorder
import me.meeshy.sdk.model.game.engagement.RevealPhotoMoment
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AchievementShareCardTest {

    private fun resourcesIn(tag: String): Resources {
        val base = RuntimeEnvironment.getApplication() as Context
        val configuration = Configuration(base.resources.configuration).apply { setLocale(Locale.forLanguageTag(tag)) }
        return base.createConfigurationContext(configuration).resources
    }

    private val moment = RevealPhotoMoment("achievement:achievement.first_voice", "Première voix", AchievementRarity.Epic)

    private fun spec(moment: RevealPhotoMoment = this.moment, handle: String? = "alice") =
        AchievementShareCardSpec.of(resourcesIn("fr"), Locale.FRENCH, moment, handle)

    @Test
    fun `la carte dit l'etiquette, le titre, la rarete visible et le pseudo public de l'auteur`() {
        val card = spec()

        assertThat(card.kicker).isEqualTo("Haut fait")
        assertThat(card.title).isEqualTo("Première voix")
        assertThat(card.rarityLine).isEqualTo("Épique")
        assertThat(card.authorLine).isEqualTo("Haut fait de @alice")
        assertThat(card.border).isEqualTo(RarityBorder.Violet)
    }

    @Test
    fun `sans rarete montrable ni auteur, la carte ne fabrique ni liseré ni plaque`() {
        val card = spec(moment.copy(rarity = null), handle = "  ")

        assertThat(card.rarityLine).isNull()
        assertThat(card.border).isNull()
        assertThat(card.authorLine).isNull()
    }

    @Test
    fun `un pseudo deja prefixe d'un arobase ne l'est pas deux fois`() {
        assertThat(spec(handle = "@alice").authorLine).isEqualTo("Haut fait de @alice")
    }

    @Test
    fun `la carte est un PNG 9 sur 16 pose dans le cache partage, le precedent est remplace`() {
        val context = RuntimeEnvironment.getApplication()
        val stale = File(File(context.cacheDir, "shared-media").apply { mkdirs() }, "ancien.png").apply { writeText("x") }

        val file = AchievementCardSharer.write(context, spec(), moment)

        assertThat(stale.exists()).isFalse()
        assertThat(file.parentFile!!.name).isEqualTo("shared-media")
        assertThat(file.name).isEqualTo(moment.fileName)
        assertThat(file.length()).isGreaterThan(0L)
        assertThat(AchievementShareCardRenderer.WIDTH * 16).isEqualTo(AchievementShareCardRenderer.HEIGHT * 9)
    }
}
