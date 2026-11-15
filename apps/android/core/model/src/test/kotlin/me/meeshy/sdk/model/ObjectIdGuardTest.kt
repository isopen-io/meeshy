package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.util.UUID

/**
 * La frontière ObjectId (#11609) — miroir Kotlin de `ObjectID` (iOS), `OBJECT_ID_REGEX`
 * (`packages/shared/utils/object-id.ts`) et de la garde du gateway : un identifiant local
 * (`cid_`, `cmid_`, `pending_`) nomme une chose que le serveur ne connaît pas encore et ne
 * part jamais vers une route qui attend un ObjectId.
 */
class ObjectIdGuardTest {

    @Test
    fun `a 24 character hex string is an object id`() {
        assertThat(ObjectIdGuard.isValid("507f1f77bcf86cd799439011")).isTrue()
    }

    @Test
    fun `the case of the hex digits does not matter`() {
        assertThat(ObjectIdGuard.isValid("507F1F77BCF86CD799439011")).isTrue()
        assertThat(ObjectIdGuard.isValid("507f1F77bCf86Cd799439011")).isTrue()
    }

    @Test
    fun `a pending story id is not an object id`() {
        assertThat(ObjectIdGuard.isValid("pending_${UUID.randomUUID()}")).isFalse()
    }

    @Test
    fun `the other local id shapes are not object ids`() {
        assertThat(ObjectIdGuard.isValid("cid_${UUID.randomUUID()}")).isFalse()
        assertThat(ObjectIdGuard.isValid("cmid_${UUID.randomUUID()}")).isFalse()
        assertThat(ObjectIdGuard.isValid(UUID.randomUUID().toString())).isFalse()
    }

    @Test
    fun `a wrong length is refused`() {
        assertThat(ObjectIdGuard.isValid("")).isFalse()
        assertThat(ObjectIdGuard.isValid("507f1f77bcf86cd79943901")).isFalse()
        assertThat(ObjectIdGuard.isValid("507f1f77bcf86cd7994390111")).isFalse()
    }

    @Test
    fun `24 characters are not enough, they must be hexadecimal`() {
        assertThat(ObjectIdGuard.isValid("zzzzzzzzzzzzzzzzzzzzzzzz")).isFalse()
        assertThat(ObjectIdGuard.isValid("507f1f77bcf86cd79943901g")).isFalse()
        assertThat(ObjectIdGuard.isValid("507f1f77-bcf8-6cd7994390")).isFalse()
    }

    @Test
    fun `a trailing line break does not slip through`() {
        assertThat(ObjectIdGuard.isValid("507f1f77bcf86cd79943901\n")).isFalse()
    }

    @Test
    fun `a non ASCII digit of the right length is refused`() {
        assertThat(ObjectIdGuard.isValid("٥٠٧f1f77bcf86cd799439011")).isFalse()
    }

    @Test
    fun `null is not an object id`() {
        assertThat(ObjectIdGuard.isValid(null)).isFalse()
    }

    @Test
    fun `cid cmid and pending ids are local ids`() {
        assertThat(ObjectIdGuard.isLocalId("cid_${UUID.randomUUID()}")).isTrue()
        assertThat(ObjectIdGuard.isLocalId("cmid_${UUID.randomUUID()}")).isTrue()
        assertThat(ObjectIdGuard.isLocalId("pending_${UUID.randomUUID()}")).isTrue()
    }

    @Test
    fun `a server object id is not a local id`() {
        assertThat(ObjectIdGuard.isLocalId("507f1f77bcf86cd799439011")).isFalse()
    }

    @Test
    fun `a conversation identifier the gateway also addresses is not a local id`() {
        assertThat(ObjectIdGuard.isLocalId("meeshy")).isFalse()
        assertThat(ObjectIdGuard.isLocalId("mshy_team-room")).isFalse()
    }

    @Test
    fun `a bare prefix without a body is not a local id`() {
        assertThat(ObjectIdGuard.isLocalId("cid_")).isFalse()
        assertThat(ObjectIdGuard.isLocalId("")).isFalse()
        assertThat(ObjectIdGuard.isLocalId(null)).isFalse()
    }

    @Test
    fun `no local id is ever an object id`() {
        val locals = listOf("cid_a", "cmid_a", "pending_a", "cid_${UUID.randomUUID()}")

        assertThat(locals.filter { ObjectIdGuard.isLocalId(it) && ObjectIdGuard.isValid(it) }).isEmpty()
    }
}
