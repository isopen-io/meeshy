package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #13530 — le lien que l'écran visiteur a mis en attente ne se rejoue qu'une fois un COMPTE connecté (JWT) : une session
 * d'invité (jonction d'un lien de conversation) est « authentifiée » mais n'est pas un compte, et ne le consomme pas.
 */
class PendingVisitorLinkTest {
    @Test
    fun `un lien mis en attente par un visiteur ne se rejoue pas sous une session invitee`() {
        assertThat(WarmDeepLink.mayReplay(isAuthenticated = true, hasAccount = false, awaitsAccount = true)).isFalse()
    }

    @Test
    fun `puis la connexion d un compte le rejoue`() {
        assertThat(WarmDeepLink.mayReplay(isAuthenticated = true, hasAccount = true, awaitsAccount = true)).isTrue()
    }

    @Test
    fun `un lien ordinaire recu sous une session invitee se rejoue comme avant`() {
        assertThat(WarmDeepLink.mayReplay(isAuthenticated = true, hasAccount = false, awaitsAccount = false)).isTrue()
    }

    @Test
    fun `sans aucune session rien ne se rejoue`() {
        assertThat(WarmDeepLink.mayReplay(isAuthenticated = false, hasAccount = false, awaitsAccount = false)).isFalse()
        assertThat(WarmDeepLink.mayReplay(isAuthenticated = false, hasAccount = false, awaitsAccount = true)).isFalse()
    }
}
