package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PermissionGrant
import me.meeshy.sdk.model.PermissionSnapshot
import org.junit.Test

/**
 * Le vocabulaire unique de l'état d'un accès (miroir de `MediaPermissionState` du SDK
 * iOS, `DevicePermissions.swift`) et les trois décisions qui en dérivent : peut-on
 * l'utiliser, faut-il demander, faut-il renvoyer vers les Réglages. Chaque appelant
 * traçait autrefois cette ligne à sa façon (« limité » traité comme un refus) ; elle
 * n'a désormais qu'un seul endroit.
 */
class MediaPermissionStateTest {

    private fun snapshot(
        grant: PermissionGrant = PermissionGrant.NONE,
        promptable: Boolean = true,
        everRequested: Boolean = false,
        rationaleSuggested: Boolean = false,
        blockedByPolicy: Boolean = false,
    ) = PermissionSnapshot(
        grant = grant,
        promptable = promptable,
        everRequested = everRequested,
        rationaleSuggested = rationaleSuggested,
        blockedByPolicy = blockedByPolicy,
    )

    @Test
    fun `usable only when granted or limited`() {
        val usable = MediaPermissionState.values().filter { it.isUsable }

        assertThat(usable).containsExactly(MediaPermissionState.GRANTED, MediaPermissionState.LIMITED)
    }

    @Test
    fun `only a never decided access can be asked for`() {
        val promptable = MediaPermissionState.values().filter { it.canPrompt }

        assertThat(promptable).containsExactly(MediaPermissionState.NOT_DETERMINED)
    }

    @Test
    fun `denied and restricted both send the user to the settings`() {
        val redirected = MediaPermissionState.values().filter { it.needsSettingsRedirect }

        assertThat(redirected).containsExactly(MediaPermissionState.DENIED, MediaPermissionState.RESTRICTED)
    }

    @Test
    fun `restricted is never invitable`() {
        assertThat(MediaPermissionState.RESTRICTED.canPrompt).isFalse()
        assertThat(MediaPermissionState.RESTRICTED.isUsable).isFalse()
    }

    @Test
    fun `every state falls in exactly one of the three decisions`() {
        MediaPermissionState.values().forEach { state ->
            val decisions = listOf(state.isUsable, state.canPrompt, state.needsSettingsRedirect)

            assertThat(decisions.count { it }).isEqualTo(1)
        }
    }

    @Test
    fun `a full grant is granted`() {
        assertThat(snapshot(grant = PermissionGrant.FULL).state).isEqualTo(MediaPermissionState.GRANTED)
    }

    @Test
    fun `a partial photo grant counts as granted through limited`() {
        val state = snapshot(grant = PermissionGrant.PARTIAL).state

        assertThat(state).isEqualTo(MediaPermissionState.LIMITED)
        assertThat(state.isUsable).isTrue()
    }

    @Test
    fun `never asked is not determined`() {
        assertThat(snapshot().state).isEqualTo(MediaPermissionState.NOT_DETERMINED)
    }

    @Test
    fun `refused once with an explanation still possible stays promptable`() {
        val state = snapshot(everRequested = true, rationaleSuggested = true).state

        assertThat(state).isEqualTo(MediaPermissionState.NOT_DETERMINED)
        assertThat(state.canPrompt).isTrue()
    }

    @Test
    fun `refused after being asked with no explanation left is a definitive denial`() {
        val state = snapshot(everRequested = true, rationaleSuggested = false).state

        assertThat(state).isEqualTo(MediaPermissionState.DENIED)
        assertThat(state.needsSettingsRedirect).isTrue()
    }

    @Test
    fun `an access without a system prompt can only be changed from the settings`() {
        assertThat(snapshot(promptable = false).state).isEqualTo(MediaPermissionState.DENIED)
    }

    @Test
    fun `a policy block wins over everything including a grant`() {
        val state = snapshot(grant = PermissionGrant.FULL, blockedByPolicy = true).state

        assertThat(state).isEqualTo(MediaPermissionState.RESTRICTED)
        assertThat(state.isUsable).isFalse()
    }
}
