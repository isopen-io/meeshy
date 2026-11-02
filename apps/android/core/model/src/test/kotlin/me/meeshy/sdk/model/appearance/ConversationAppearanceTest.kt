package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Test

class ConversationAppearanceTest {

    private fun read(text: String) = ConversationAppearance.read(Json.parseToJsonElement(text))

    @Test
    fun `une valeur qui n est pas un objet rend le defaut`() {
        assertThat(ConversationAppearance.read(null)).isEqualTo(ConversationAppearance.DEFAULT)
        assertThat(read("\"x\"")).isEqualTo(ConversationAppearance.DEFAULT)
        assertThat(read("[1]")).isEqualTo(ConversationAppearance.DEFAULT)
    }

    @Test
    fun `un fond d une passerelle plus recente retombe sur Signature sans perdre l accent`() {
        val read = read("""{"v":1,"background":{"kind":"hologram"},"accent":"ocean","animate":false}""")
        assertThat(read.background).isEqualTo(ConversationBackground.Signature)
        assertThat(read.accent).isEqualTo("ocean")
        assertThat(read.animate).isFalse()
    }

    @Test
    fun `un accent hors gamme rend Automatique sans perdre le fond`() {
        val read = ConversationAppearance.read(
            Json.parseToJsonElement("""{"background":{"kind":"solid","color":"sky"},"accent":"inconnu"}"""),
            isGamutKey = { it == "sky" },
        )
        assertThat(read.background).isEqualTo(ConversationBackground.Solid("sky"))
        assertThat(read.accent).isNull()
    }

    @Test
    fun `une photo lue est bornee au voile et au flou du contrat`() {
        val read = read("""{"background":{"kind":"photo","attachmentId":"a1","veil":0.95,"blur":99}}""")
        assertThat(read.background).isEqualTo(ConversationBackground.Photo("a1", 0.8, 24))
    }

    @Test
    fun `un champ manquant d un fond rend Signature`() {
        assertThat(read("""{"background":{"kind":"design","pack":"p"}}""").background).isEqualTo(ConversationBackground.Signature)
        assertThat(read("""{"background":{"kind":"photo","attachmentId":"a1","veil":0.3}}""").background).isEqualTo(ConversationBackground.Signature)
    }

    @Test
    fun `le corps d ecriture porte un accent null explicite que le serveur strict exige`() {
        val wire = ConversationAppearance.DEFAULT.toWire()
        assertThat(wire["accent"]).isEqualTo(JsonNull)
        assertThat(wire["v"].toString()).isEqualTo("1")
        assertThat(wire["background"]!!.jsonObject["kind"].toString()).isEqualTo("\"signature\"")
    }

    @Test
    fun `l ecriture puis la lecture se retrouvent`() {
        val chosen = ConversationAppearance.DEFAULT.withDesign("essentials", "dots").withAccent("ocean").withPhoto("a1").withPhotoBlur(8)
        assertThat(ConversationAppearance.read(chosen.toWire())).isEqualTo(chosen)
    }

    @Test
    fun `un choix identique rend la meme instance`() {
        val a = ConversationAppearance.DEFAULT.withAccent("ocean")
        assertThat(a.withAccent("ocean")).isSameInstanceAs(a)
        assertThat(ConversationAppearance.DEFAULT.withPhotoVeil(0.5)).isSameInstanceAs(ConversationAppearance.DEFAULT)
    }

    @Test
    fun `le voile se regle par pas de cinq centiemes et un meme cran n est pas un nouveau choix`() {
        val photo = ConversationAppearance.DEFAULT.withPhoto("a1")
        assertThat((photo.withPhotoVeil(0.52).background as ConversationBackground.Photo).veil).isEqualTo(0.5)
        assertThat(photo.withPhotoVeil(0.31)).isSameInstanceAs(photo)
        assertThat((photo.withPhotoVeil(7.0).background as ConversationBackground.Photo).veil).isEqualTo(0.8)
    }

    @Test
    fun `une photo choisie hérite du voile et du flou de la precedente`() {
        val first = ConversationAppearance.DEFAULT.withPhoto("a1").withPhotoVeil(0.6).withPhotoBlur(10)
        assertThat(first.withPhoto("a2").background).isEqualTo(ConversationBackground.Photo("a2", 0.6, 10))
    }

    @Test
    fun `Signature par defaut et reinitialisation`() {
        assertThat(ConversationAppearance.DEFAULT.isDefault).isTrue()
        assertThat(ConversationAppearance.DEFAULT.withAccent("ocean").isDefault).isFalse()
        assertThat(ConversationAppearance.DEFAULT.withAccent("ocean").withAccent(null).isDefault).isTrue()
    }

    @Test
    fun `le voile effectif ne descend pas sous le plancher en transparence reduite`() {
        assertThat(ConversationBackgroundResolution.effectiveVeil(0.2, reduceTransparency = true)).isEqualTo(0.6)
        assertThat(ConversationBackgroundResolution.effectiveVeil(0.7, reduceTransparency = true)).isEqualTo(0.7)
        assertThat(ConversationBackgroundResolution.effectiveVeil(0.2, reduceTransparency = false)).isEqualTo(0.2)
    }

    @Test
    fun `sans catalogue un fond de pack ou uni retombe sur Signature`() {
        val empty = AppearanceCatalog.EMPTY
        val design = ConversationAppearance.DEFAULT.withDesign("p", "d")
        assertThat(ConversationBackgroundResolution.resolve(design, false, empty)).isEqualTo(ConversationBackgroundResolution.Signature)
        assertThat(ConversationBackgroundResolution.resolve(ConversationAppearance.DEFAULT.withSolid("sky"), true, empty))
            .isEqualTo(ConversationBackgroundResolution.Signature)
        assertThat(ConversationBackgroundResolution.effectiveAccentHex(ConversationAppearance.DEFAULT.withAccent("sky"), "#112233", false, empty))
            .isEqualTo("#112233")
    }

    @Test
    fun `sans liste lue les packs installes d office, un 404 ne laisse aucun pack`() {
        val empty = AppearanceCatalog.EMPTY
        assertThat(WallpaperPackOptions.packs(null, empty)).isEmpty()
        assertThat(WallpaperPackOptions.installedFromFailure(404)).isEmpty()
        assertThat(WallpaperPackOptions.installedFromFailure(500)).isNull()
        assertThat(WallpaperPackOptions.installedFromFailure(null)).isNull()
    }
}
