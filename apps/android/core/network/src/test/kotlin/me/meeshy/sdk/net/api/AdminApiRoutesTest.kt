package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class AdminApiRoutesTest {

    @Test
    fun `lire mes droits appelle admin me permissions et decode les neuf drapeaux`() = runTest {
        val http = RecordingHttp(
            responseBody = """{"success":true,"data":{"role":"MODERATOR","permissions":{"canModerateContent":true,"canAccessAdmin":false}}}""",
        )

        val response = http.serve(AdminApi::class.java).myPermissions()

        assertThat(http.only.method).isEqualTo("GET")
        assertThat(http.only.path).isEqualTo("/api/v1/admin/me/permissions")
        assertThat(response.data!!.role).isEqualTo("MODERATOR")
        assertThat(response.data!!.permissions.canModerateContent).isTrue()
        assertThat(response.data!!.permissions.canManageUsers).isFalse()
    }
}
