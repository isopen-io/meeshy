package me.meeshy.app.appearance

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.ui.appearance.AvatarRingResolver
import org.junit.Test

class AvatarRingResolverProviderTest {

    private val equipped = ServedProfileDecorItem(pack = "contours-essentiels", item = "filet")

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
}
