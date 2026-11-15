package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PlatformRoleTest {

    @Test
    fun `levels follow GLOBAL_ROLE_HIERARCHY of the shared types`() {
        val levels = PlatformRole.entries.associate { it.wireValue to it.level }
        assertThat(levels).containsExactly(
            "BIGBOSS", 100,
            "ADMIN", 80,
            "MODERATOR", 60,
            "AUDIT", 40,
            "ANALYST", 30,
            "USER", 10,
            "AGENT", 5,
        )
    }

    @Test
    fun `the exact reading refuses a lowercase moderator, so it does not moderate`() {
        assertThat(PlatformRole.exact("moderator")).isNull()
        assertThat(PlatformRole.exact("MODERATOR")).isEqualTo(PlatformRole.MODERATOR)
        assertThat(PlatformRole.exact("MODERATOR")!!.moderatesContent).isTrue()
    }

    @Test
    fun `the case folding reading administers a lowercase admin`() {
        assertThat(PlatformRole.caseFolding("admin")).isEqualTo(PlatformRole.ADMIN)
        assertThat(PlatformRole.caseFolding("bigBoss")!!.administers).isTrue()
    }

    @Test
    fun `an unknown or absent role is no role and has the minimum level`() {
        assertThat(PlatformRole.exact("SUPERUSER")).isNull()
        assertThat(PlatformRole.caseFolding(null)).isNull()
        assertThat(PlatformRole.levelOf("SUPERUSER")).isEqualTo(PlatformRole.MINIMUM_LEVEL)
        assertThat(PlatformRole.levelOf("admin")).isEqualTo(80)
    }

    @Test
    fun `only MODERATOR, ADMIN and BIGBOSS moderate and only ADMIN and BIGBOSS administer`() {
        val moderators = PlatformRole.entries.filter { it.moderatesContent }
        val administrators = PlatformRole.entries.filter { it.administers }
        assertThat(moderators).containsExactly(PlatformRole.BIGBOSS, PlatformRole.ADMIN, PlatformRole.MODERATOR)
        assertThat(administrators).containsExactly(PlatformRole.BIGBOSS, PlatformRole.ADMIN)
    }

    @Test
    fun `AUDIT and ANALYST read but hold no action privilege`() {
        listOf(PlatformRole.AUDIT, PlatformRole.ANALYST).forEach { role ->
            assertThat(role.moderatesContent).isFalse()
            assertThat(role.administers).isFalse()
        }
    }
}
