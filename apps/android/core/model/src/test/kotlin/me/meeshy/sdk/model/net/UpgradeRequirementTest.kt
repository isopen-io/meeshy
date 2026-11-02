package me.meeshy.sdk.model.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class UpgradeRequirementTest {
    private val playStore = "https://play.google.com/store/apps/details?id=me.meeshy.app"

    private fun served(minVersion: String = "2.1.0", storeUrl: String? = "https://play.google.com/store/apps/details?id=me.meeshy.app") =
        UpgradeRequirement(minVersion, storeUrl)

    @Test
    fun `le corps 426 se lit a la racine, la ou sendError etale les details`() {
        val body = """{"success":false,"error":"App version outdated - update the app","code":"UPGRADE_REQUIRED","minVersion":"2.1.0","storeUrl":"https://play.google.com/store/apps/details?id=me.meeshy.app"}"""
        assertThat(UpgradeRequirement.fromResponseBody(body)).isEqualTo(served())
    }

    @Test
    fun `un details range sous une cle ne se lit pas`() {
        val body = """{"details":{"minVersion":"2.1.0","storeUrl":"https://example.org"}}"""
        assertThat(UpgradeRequirement.fromResponseBody(body)).isEqualTo(UpgradeRequirement("", null))
    }

    @Test
    fun `un corps illisible ou absent n annule pas la rupture, c est le statut qui la declenche`() {
        val bare = UpgradeRequirement("", null)
        assertThat(UpgradeRequirement.fromResponseBody(null)).isEqualTo(bare)
        assertThat(UpgradeRequirement.fromResponseBody("")).isEqualTo(bare)
        assertThat(UpgradeRequirement.fromResponseBody("<html>426</html>")).isEqualTo(bare)
        assertThat(UpgradeRequirement.fromResponseBody("[1,2]")).isEqualTo(bare)
        assertThat(UpgradeRequirement.fromResponseBody("""{"minVersion":2,"storeUrl":null}""")).isEqualTo(bare)
    }

    @Test
    fun `l evenement socket error ne declenche que par son code`() {
        val payload = """{"message":"App version outdated - update the app","code":"UPGRADE_REQUIRED","minVersion":"2.1.0","storeUrl":"https://play.google.com/store/apps/details?id=me.meeshy.app"}"""
        assertThat(UpgradeRequirement.fromSocketPayload(payload)).isEqualTo(served())
        assertThat(UpgradeRequirement.fromSocketPayload("""{"code":"UPGRADE_REQUIRED"}""")).isEqualTo(UpgradeRequirement("", null))
        assertThat(UpgradeRequirement.fromSocketPayload("""{"code":"NEWCOMER_SLOW_MODE","minVersion":"2.1.0"}""")).isNull()
        assertThat(UpgradeRequirement.fromSocketPayload("""{"message":"x"}""")).isNull()
        assertThat(UpgradeRequirement.fromSocketPayload("pas du json")).isNull()
        assertThat(UpgradeRequirement.fromSocketPayload("")).isNull()
    }

    @Test
    fun `l URL servie par le serveur l emporte quand elle est en https`() {
        assertThat(served(storeUrl = "https://play.google.com/store/apps/details?id=me.meeshy.beta").resolvedStoreUrl)
            .isEqualTo("https://play.google.com/store/apps/details?id=me.meeshy.beta")
    }

    @Test
    fun `sans URL servie, ou avec une URL qui n est pas https, le Play Store par defaut s ouvre`() {
        assertThat(served(storeUrl = null).resolvedStoreUrl).isEqualTo(playStore)
        assertThat(served(storeUrl = "").resolvedStoreUrl).isEqualTo(playStore)
        assertThat(served(storeUrl = "   ").resolvedStoreUrl).isEqualTo(playStore)
        assertThat(served(storeUrl = "intent://scan#Intent;end").resolvedStoreUrl).isEqualTo(playStore)
        assertThat(served(storeUrl = "javascript:alert(1)").resolvedStoreUrl).isEqualTo(playStore)
        assertThat(served(storeUrl = "http://play.google.com/x").resolvedStoreUrl).isEqualTo(playStore)
        assertThat(served(storeUrl = "https://").resolvedStoreUrl).isEqualTo(playStore)
    }

    @Test
    fun `la version minimale ne se montre que si le serveur l a donnee`() {
        assertThat(served(minVersion = "2.1.0").shownMinVersion).isEqualTo("2.1.0")
        assertThat(served(minVersion = "  ").shownMinVersion).isNull()
        assertThat(UpgradeRequirement("", null).shownMinVersion).isNull()
    }

    @Test
    fun `une exigence informative n est jamais ecrasee par une exigence nue`() {
        val bare = UpgradeRequirement("", null)
        assertThat(UpgradeRequirement.preferred(null, bare)).isEqualTo(bare)
        assertThat(UpgradeRequirement.preferred(bare, served())).isEqualTo(served())
        assertThat(UpgradeRequirement.preferred(served(), bare)).isEqualTo(served())
        assertThat(UpgradeRequirement.preferred(served("2.1.0"), served("2.2.0"))).isEqualTo(served("2.1.0"))
    }

    @Test
    fun `426 est nomme une seule fois`() {
        assertThat(UpgradeRequirement.STATUS).isEqualTo(426)
        assertThat(UpgradeRequirement.CODE).isEqualTo("UPGRADE_REQUIRED")
    }
}
