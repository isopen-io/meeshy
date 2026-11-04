package me.meeshy.sdk.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareAttachmentFanoutTest {

    private fun ids(n: Int) = (1..n).map { "cid_$it" }

    @Test
    fun `un upload pour dix cibles, les neuf autres copient l'origine`() {
        val plan = ShareAttachmentFanout.plan(ids(10))
        assertThat(ShareAttachmentFanout.uploadCount(plan)).isEqualTo(1)
        assertThat(plan.first().isOrigin).isTrue()
        assertThat(plan.drop(1).map { it.copyFrom }.distinct()).containsExactly("cid_1")
    }

    @Test
    fun `une seule cible est son propre upload et sans cible rien ne part`() {
        assertThat(ShareAttachmentFanout.plan(ids(1)).single().copyFrom).isNull()
        assertThat(ShareAttachmentFanout.plan(emptyList())).isEmpty()
    }

    @Test
    fun `les doublons et les blancs ne creent ni cible ni copie de soi`() {
        val plan = ShareAttachmentFanout.plan(listOf("cid_1", "", "cid_1", "cid_2"))
        assertThat(plan.map { it.targetClientMessageId }).containsExactly("cid_1", "cid_2").inOrder()
    }

    @Test
    fun `l'origine non acquittee fait attendre, acquittee elle est resolue, sans copie rien ne change`() {
        assertThat(ShareFanoutOriginResolver.resolve(null, null)).isEqualTo(FanoutResolution.NotAFanout)
        assertThat(ShareFanoutOriginResolver.resolve("cid_1", null)).isEqualTo(FanoutResolution.WaitingForOrigin("cid_1"))
        assertThat(ShareFanoutOriginResolver.resolve("cid_1", "")).isEqualTo(FanoutResolution.WaitingForOrigin("cid_1"))
        assertThat(ShareFanoutOriginResolver.resolve("cid_1", "srv")).isEqualTo(FanoutResolution.Ready("srv"))
    }
}
