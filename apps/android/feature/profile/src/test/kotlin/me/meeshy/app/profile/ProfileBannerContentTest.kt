package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.ProfileBannerPaint
import org.junit.Test

class ProfileBannerContentTest {

    private val catalog: AppearanceCatalog by lazy {
        val relative = "sdk-core/src/main/assets/appearance-catalog.json"
        val file = generateSequence(File(".").absoluteFile) { it.parentFile }.take(8)
            .flatMap { sequenceOf(File(it, relative), File(it, "apps/android/$relative")) }
            .first { it.isFile }
        AppearanceCatalog.decodeOrEmpty(file.readText())
    }

    private fun builtin(pack: String, item: String) = ServedProfileDecorItem(pack, item, PackOrigin.BUILTIN)

    private fun user(banner: String? = null, decor: ServedProfileDecor? = null) =
        MeeshyUser(id = "u1", username = "alice", banner = banner, profileDecor = decor)

    private fun knownFrame(): ServedProfileDecorItem {
        val pack = catalog.bannerFramePacks.first()
        return builtin(pack.slug, pack.frames.first().key)
    }

    @Test
    fun `un profil sans banniere ni cadre garde son en-tete`() {
        assertThat(ProfileBannerContent.of(user(), catalog)).isNull()
    }

    @Test
    fun `un cadre equipe se pose sur le fond uni`() {
        val content = ProfileBannerContent.of(user(decor = ServedProfileDecor(bannerFrame = knownFrame())), catalog)!!

        assertThat(content.paint).isEqualTo(ProfileBannerPaint.Plain)
        assertThat(content.frame).isNotNull()
    }

    @Test
    fun `la photo reste peinte sous le cadre`() {
        val content = ProfileBannerContent.of(
            user(banner = "https://x/b.jpg", decor = ServedProfileDecor(bannerFrame = knownFrame())),
            catalog,
        )!!

        assertThat(content.paint).isEqualTo(ProfileBannerPaint.Photo("https://x/b.jpg"))
        assertThat(content.frame).isNotNull()
    }

    @Test
    fun `une banniere de design equipee se peint sans photo`() {
        val pack = catalog.bannerPacks.first()
        val item = builtin(pack.slug, pack.designs.first().key)

        val content = ProfileBannerContent.of(user(decor = ServedProfileDecor(banner = item)), catalog)!!

        assertThat(content.paint).isInstanceOf(ProfileBannerPaint.Design::class.java)
        assertThat(content.frame).isNull()
    }

    @Test
    fun `un cadre inconnu d'une version plus recente du catalogue est ignore`() {
        val unknown = builtin("pack-du-futur", "cadre-du-futur")

        assertThat(ProfileBannerContent.of(user(decor = ServedProfileDecor(bannerFrame = unknown)), catalog)).isNull()
        val withPhoto = ProfileBannerContent.of(
            user(banner = "https://x/b.jpg", decor = ServedProfileDecor(bannerFrame = unknown)),
            catalog,
        )!!
        assertThat(withPhoto.frame).isNull()
        assertThat(withPhoto.paint).isEqualTo(ProfileBannerPaint.Photo("https://x/b.jpg"))
    }
}
