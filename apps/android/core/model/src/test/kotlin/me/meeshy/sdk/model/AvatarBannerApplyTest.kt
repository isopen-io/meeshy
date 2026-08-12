package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [AvatarBannerApply] — the optimistic-paint merge SSOT
 * for a freshly uploaded profile image (feature-parity §K). It mirrors
 * [ProfileEditApply]: the targeted field is overwritten and every other field is
 * left exactly as it was, so the local paint matches what the gateway persists and
 * a confirmed delivery never visibly re-paints.
 */
class AvatarBannerApplyTest {

    private fun user() = MeeshyUser(
        id = "u1",
        username = "alice",
        firstName = "Alice",
        avatar = "old-avatar",
        banner = "old-banner",
    )

    @Test
    fun applyingAnAvatarOverwritesOnlyTheAvatar() {
        val result = AvatarBannerApply.apply(user(), ImageUploadTarget.AVATAR, "new-avatar")

        assertThat(result.avatar).isEqualTo("new-avatar")
        assertThat(result.banner).isEqualTo("old-banner")
    }

    @Test
    fun applyingABannerOverwritesOnlyTheBanner() {
        val result = AvatarBannerApply.apply(user(), ImageUploadTarget.BANNER, "new-banner")

        assertThat(result.banner).isEqualTo("new-banner")
        assertThat(result.avatar).isEqualTo("old-avatar")
    }

    @Test
    fun applyingLeavesAllUnrelatedIdentityFieldsUntouched() {
        val result = AvatarBannerApply.apply(user(), ImageUploadTarget.AVATAR, "new-avatar")

        assertThat(result.id).isEqualTo("u1")
        assertThat(result.username).isEqualTo("alice")
        assertThat(result.firstName).isEqualTo("Alice")
    }

    @Test
    fun applyingAnAvatarOntoAUserWithNoPriorAvatarSetsIt() {
        val fresh = MeeshyUser(id = "u2", username = "bob")

        val result = AvatarBannerApply.apply(fresh, ImageUploadTarget.AVATAR, "first-avatar")

        assertThat(result.avatar).isEqualTo("first-avatar")
        assertThat(result.banner).isNull()
    }
}
