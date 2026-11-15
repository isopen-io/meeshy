package me.meeshy.sdk.model.syncpill

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SyncPillDockClaimsTest {
    @Test
    fun `the last claimant wins and releasing hands back to the previous`() {
        val claims = SyncPillDockClaims().claim("list", 40f).claim("chat", 90f)
        assertThat(claims.height).isEqualTo(90f)
        assertThat(claims.release("chat").height).isEqualTo(40f)
        assertThat(claims.release("chat").release("list").height).isEqualTo(0f)
    }

    @Test
    fun `an update keeps its rank`() {
        val claims = SyncPillDockClaims().claim("list", 40f).claim("chat", 90f).claim("list", 50f)
        assertThat(claims.height).isEqualTo(90f)
    }

    @Test
    fun `heights round to the half point and clamp at zero`() {
        assertThat(SyncPillDockClaims().claim("a", 10.3f).height).isEqualTo(10.5f)
        assertThat(SyncPillDockClaims().claim("a", 10.2f).height).isEqualTo(10f)
        assertThat(SyncPillDockClaims().claim("a", -5f).height).isEqualTo(0f)
        assertThat(SyncPillDockClaims().claim("a", 10.25f)).isEqualTo(SyncPillDockClaims().claim("a", 10.4f).claim("a", 10.25f))
    }
}
