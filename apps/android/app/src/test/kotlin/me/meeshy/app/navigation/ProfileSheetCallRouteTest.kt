package me.meeshy.app.navigation

import android.net.Uri
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.profile.ProfileCallRequest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * L'appel lancé depuis une fiche : le module d'appel exige un identifiant de salle, donc la conversation
 * directe commune (créée d'abord par la fiche). Sans elle, aucune route ne part.
 */
@RunWith(RobolectricTestRunner::class)
class ProfileSheetCallRouteTest {

    @Test
    fun `la route d'appel porte la conversation directe commune, le nom et le mode video`() {
        val request = ProfileCallRequest(userId = "u2", displayName = "Ada & Co", isVideo = true, conversationId = "c1")

        val uri = Uri.parse(requireNotNull(request.routePath()))

        assertThat(uri.getQueryParameter(CallRoute.CONVERSATION_ID_ARG)).isEqualTo("c1")
        assertThat(uri.getQueryParameter(CallRoute.PEER_NAME_ARG)).isEqualTo("Ada & Co")
        assertThat(uri.getQueryParameter(CallRoute.VIDEO_ARG)).isEqualTo("true")
    }

    @Test
    fun `un appel vocal reste vocal`() {
        val request = ProfileCallRequest(userId = "u2", displayName = "Ada", isVideo = false, conversationId = "c1")

        assertThat(Uri.parse(requireNotNull(request.routePath())).getQueryParameter(CallRoute.VIDEO_ARG)).isEqualTo("false")
    }

    @Test
    fun `sans conversation commune aucune route ne part`() {
        assertThat(ProfileCallRequest("u2", "Ada", isVideo = false, conversationId = null).routePath()).isNull()
        assertThat(ProfileCallRequest("u2", "Ada", isVideo = false, conversationId = " ").routePath()).isNull()
    }
}
