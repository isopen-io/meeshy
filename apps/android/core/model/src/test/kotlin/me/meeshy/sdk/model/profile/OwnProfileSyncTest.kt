package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserUpdatedEvent.OptionalMediaChange
import me.meeshy.sdk.model.socket.SocketEventNames
import org.junit.Test

/**
 * #18924 — `profile:updated` on `user:<me>`: my languages, name and pictures changed on another device reach this one at
 * once. The snapshot is the row AFTER the write, arbitrated by `updatedAt` (`ownProfileSnapshotIsStale`,
 * `@meeshy/shared/types/own-profile-sync`): only what is PROVED older is set aside.
 */
class OwnProfileSyncTest {

    /** The key-by-key payload of `ownProfileUpdatedPayload` (`services/gateway/src/routes/users/own-profile-sync.ts`). */
    private val wire = """
        {"userId":"me","updatedAt":"2026-11-17T10:05:00.000Z","profile":{
          "systemLanguage":"en","regionalLanguage":null,"customDestinationLanguage":"es",
          "displayName":null,"firstName":"Ada","lastName":"Lovelace","username":"ada",
          "avatar":null,"banner":"https://cdn/b.jpg","future":"tolerated"}}
    """.trimIndent()

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    private fun event() = json.decodeFromString(ProfileUpdatedEvent.serializer(), wire)

    private val held = MeeshyUser(
        id = "me",
        username = "ada.old",
        firstName = "A",
        lastName = "L",
        displayName = "Ada L.",
        avatar = "https://cdn/a.jpg",
        systemLanguage = "fr",
        regionalLanguage = "de",
        updatedAt = "2026-11-17T10:00:00.000Z",
    )

    @Test
    fun `the event name is the contract's`() {
        assertThat(SocketEventNames.PROFILE_UPDATED).isEqualTo("profile:updated")
    }

    @Test
    fun `the gateway payload decodes, its unknown keys tolerated`() {
        val event = event()

        assertThat(event.userId).isEqualTo("me")
        assertThat(event.profile.systemLanguage).isEqualTo("en")
        assertThat(event.profile.regionalLanguage).isNull()
        assertThat(event.profile.banner).isEqualTo("https://cdn/b.jpg")
    }

    @Test
    fun `the snapshot replaces the three languages, the name and the pictures, a null clearing the field`() {
        val applied = OwnProfileSync.applied(held, event())!!

        assertThat(applied.systemLanguage).isEqualTo("en")
        assertThat(applied.regionalLanguage).isNull()
        assertThat(applied.customDestinationLanguage).isEqualTo("es")
        assertThat(applied.displayName).isNull()
        assertThat(applied.firstName).isEqualTo("Ada")
        assertThat(applied.username).isEqualTo("ada")
        assertThat(applied.avatar).isNull()
        assertThat(applied.banner).isEqualTo("https://cdn/b.jpg")
        assertThat(applied.updatedAt).isEqualTo("2026-11-17T10:05:00.000Z")
    }

    @Test
    fun `a snapshot older than the identity held is set aside, the same instant applies`() {
        val newer = held.copy(updatedAt = "2026-11-17T10:06:00.000Z")

        assertThat(OwnProfileSync.applied(newer, event())).isNull()
        assertThat(OwnProfileSync.applied(held.copy(updatedAt = "2026-11-17T10:05:00.000Z"), event())).isNotNull()
    }

    @Test
    fun `nothing known, or an instant that does not read, and the snapshot applies`() {
        assertThat(OwnProfileSync.isStale(null, "2026-11-17T10:05:00.000Z")).isFalse()
        assertThat(OwnProfileSync.isStale("hier", "2026-11-17T10:05:00.000Z")).isFalse()
        assertThat(OwnProfileSync.isStale("2026-11-17T10:06:00.000Z", "plus tard")).isFalse()
        assertThat(OwnProfileSync.isStale("2026-11-17T11:00:00+01:00", "2026-11-17T09:59:00.000Z")).isTrue()
    }

    @Test
    fun `another account's snapshot never touches the identity held`() {
        assertThat(OwnProfileSync.applied(held.copy(id = "someone"), event())).isNull()
    }

    /** `user:updated` excludes its author: what my other caches need of the snapshot, in its shape. */
    @Test
    fun `my rosters and my messages repaint from the snapshot, a removed picture removed`() {
        val repaint = OwnProfileSync.asUserUpdated(event())

        assertThat(repaint.userId).isEqualTo("me")
        assertThat(repaint.hasNameGroup).isTrue()
        assertThat(repaint.composedName).isEqualTo("Ada Lovelace")
        assertThat(repaint.avatar).isEqualTo(OptionalMediaChange.Replaced(null))
        assertThat(repaint.banner).isEqualTo(OptionalMediaChange.Replaced("https://cdn/b.jpg"))
    }
}
