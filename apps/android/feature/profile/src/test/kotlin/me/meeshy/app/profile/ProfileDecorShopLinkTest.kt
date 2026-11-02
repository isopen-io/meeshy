package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import org.junit.Test

class ProfileDecorShopLinkTest {

    @Test
    fun `sans destination qui l'accueille, le lien de la boutique n'est pas pose`() {
        assertThat(shop(AppearancePackDomain.BANNER, null) {}).isNull()
    }

    @Test
    fun `toucher le lien ouvre la boutique DU domaine de sa section, apres le retour tactile`() {
        val events = mutableListOf<String>()
        val link = shop(AppearancePackDomain.AVATAR_RING, { events += "boutique:${it.wire}" }) { events += "haptique" }!!

        link()

        assertThat(events).containsExactly("haptique", "boutique:avatar-ring").inOrder()
    }

    @Test
    fun `chaque section ouvre son propre domaine`() {
        val opened = mutableListOf<AppearancePackDomain>()
        listOf(AppearancePackDomain.AVATAR_RING, AppearancePackDomain.BANNER, AppearancePackDomain.BANNER_FRAME)
            .forEach { shop(it, { domain -> opened += domain }) {}!!() }

        assertThat(opened).containsExactly(AppearancePackDomain.AVATAR_RING, AppearancePackDomain.BANNER, AppearancePackDomain.BANNER_FRAME).inOrder()
    }
}
