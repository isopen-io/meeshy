package me.meeshy.app.appearance

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.ui.appearance.AvatarRingResolver
import org.junit.Test

class AvatarRingResolverProviderTest {

    private val equipped = ServedProfileDecorItem(pack = "contours-essentiels", item = "filet")

    private fun catalogWithRing(): AppearanceCatalog = AppearanceCatalog.decode(
        """{"version":1,"rings":[{"slug":"contours-essentiels","order":0,"installedByDefault":true,"removable":false,
          "rings":[{"key":"filet","stroke":{"style":"solid","width":0.03,"colors":["#C9A86A","#6366F1"]}}]}]}""",
    )

    @Test
    fun `tant que le catalogue n'est pas charge aucun contour ne se peint`() {
        assertThat(avatarRingResolver(null)).isSameInstanceAs(AvatarRingResolver.Absent)
    }

    @Test
    fun `un contour absent du catalogue ou une personne sans contour ne se peint pas`() {
        val resolver = avatarRingResolver(AppearanceCatalog.EMPTY)

        assertThat(resolver.resolve(equipped)).isNull()
        assertThat(resolver.resolve(null)).isNull()
    }

    @Test
    fun `un contour embarque equipe par une personne se resout en son dessin`() {
        val resolver = avatarRingResolver(catalogWithRing())

        assertThat(resolver.resolve(equipped)?.key).isEqualTo("filet")
        assertThat(resolver.resolve(equipped.copy(origin = PackOrigin.BUILTIN, contract = "abcdef0123456789.json"))?.key)
            .isEqualTo("filet")
    }

    @Test
    fun `un contour adresse par contrat hors embarque ne se peint pas tant que son contrat manque, et il le demande`() {
        val requested = mutableListOf<String>()
        val resolver = avatarRingResolver(catalogWithRing(), requested::add)
        val served = ServedProfileDecorItem("contours-noel", "filet", PackOrigin.OFFICIAL, contract = "abcdef0123456789.json")

        assertThat(resolver.resolve(served)).isNull()
        assertThat(requested).containsExactly("abcdef0123456789.json")
    }
}
