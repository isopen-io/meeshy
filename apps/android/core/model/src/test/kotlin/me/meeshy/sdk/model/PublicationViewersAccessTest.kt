package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PublicationViewersAccessTest {

    @Test fun `l auteur d une story ou d un statut ouvre la liste`() {
        assertThat(PublicationViewersAccess.mayList("STORY", isAuthor = true, viewerRole = "USER")).isTrue()
        assertThat(PublicationViewersAccess.mayList("status", isAuthor = true, viewerRole = null)).isTrue()
    }

    @Test fun `l auteur d un post ou d un reel n en voit que le nombre`() {
        assertThat(PublicationViewersAccess.mayList("POST", isAuthor = true, viewerRole = "USER")).isFalse()
        assertThat(PublicationViewersAccess.mayList("REEL", isAuthor = true, viewerRole = "MODERATOR")).isFalse()
    }

    @Test fun `admin et bigboss ouvrent tout, un moderateur ou un lecteur non`() {
        assertThat(PublicationViewersAccess.mayList("POST", isAuthor = false, viewerRole = "admin")).isTrue()
        assertThat(PublicationViewersAccess.mayList("REEL", isAuthor = false, viewerRole = "BIGBOSS")).isTrue()
        assertThat(PublicationViewersAccess.mayList("STORY", isAuthor = false, viewerRole = "AUDIT")).isFalse()
    }
}
