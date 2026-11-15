package me.meeshy.sdk.model.lock

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LockSectionPresentationTest {

    @Test
    fun `sans code principal seul Configurer est propose`() {
        val p = lockSectionPresentation(hasMasterPin = false, lockCount = 0)
        assertThat(p.actions).containsExactly(LockSectionAction.CONFIGURE)
        assertThat(p.showLockBadge).isFalse()
    }

    @Test
    fun `sans code principal les verrous residuels ne changent rien`() {
        val p = lockSectionPresentation(hasMasterPin = false, lockCount = 3)
        assertThat(p.actions).containsExactly(LockSectionAction.CONFIGURE)
        assertThat(p.showLockBadge).isFalse()
    }

    @Test
    fun `avec code et zero verrou Modifier puis Supprimer`() {
        val p = lockSectionPresentation(hasMasterPin = true, lockCount = 0)
        assertThat(p.actions).containsExactly(LockSectionAction.CHANGE, LockSectionAction.REMOVE).inOrder()
        assertThat(p.showLockBadge).isFalse()
    }

    @Test
    fun `avec code et des verrous Supprimer disparait et Deverrouiller tout apparait`() {
        val p = lockSectionPresentation(hasMasterPin = true, lockCount = 2)
        assertThat(p.actions).containsExactly(LockSectionAction.CHANGE, LockSectionAction.UNLOCK_ALL).inOrder()
        assertThat(p.showLockBadge).isTrue()
        assertThat(p.lockCount).isEqualTo(2)
    }

    @Test
    fun `un compteur negatif est borne a zero`() {
        assertThat(lockSectionPresentation(true, -4).lockCount).isEqualTo(0)
    }

    @Test
    fun `chaque action ouvre le mode de feuille correspondant`() {
        assertThat(LockSectionAction.CONFIGURE.pinMode).isEqualTo(LockPinMode.SETUP_MASTER_PIN)
        assertThat(LockSectionAction.CHANGE.pinMode).isEqualTo(LockPinMode.CHANGE_MASTER_PIN)
        assertThat(LockSectionAction.UNLOCK_ALL.pinMode).isEqualTo(LockPinMode.UNLOCK_ALL)
        assertThat(LockSectionAction.REMOVE.pinMode).isEqualTo(LockPinMode.REMOVE_MASTER_PIN)
    }
}
