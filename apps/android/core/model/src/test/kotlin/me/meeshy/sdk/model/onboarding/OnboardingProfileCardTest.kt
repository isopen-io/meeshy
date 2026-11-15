package me.meeshy.sdk.model.onboarding

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.ImageUploadTarget
import org.junit.Test

private fun served(
    seen: List<OnboardingStepId> = emptyList(),
    prefilled: List<OnboardingStepId> = emptyList(),
    emailVerified: Boolean? = null,
    servesAge: Boolean = false,
) = ApiOnboardingState(
    eligible = true,
    seenSteps = seen,
    prefilledSteps = prefilled,
    globalConversationId = "g1",
    emailVerified = emailVerified,
    servesAgeStep = servesAge,
)

class OnboardingProfileCardTest {

    @Test
    fun `montre-toi suit l'adresse et precede Global`() {
        val steps = OnboardingFlowRules.pendingGestureSteps(served(servesAge = true, emailVerified = false))

        assertThat(steps).containsExactly(
            OnboardingStepId.LANGUAGES, OnboardingStepId.AGE, OnboardingStepId.EMAIL,
            OnboardingStepId.PROFILE, OnboardingStepId.GLOBAL, OnboardingStepId.STORY,
        ).inOrder()
    }

    @Test
    fun `montre-toi n'est plus proposee une fois vue ou pre-cochee`() {
        assertThat(OnboardingFlowRules.pendingGestureSteps(served(seen = listOf(OnboardingStepId.PROFILE))))
            .doesNotContain(OnboardingStepId.PROFILE)
        assertThat(OnboardingFlowRules.pendingGestureSteps(served(prefilled = listOf(OnboardingStepId.PROFILE))))
            .doesNotContain(OnboardingStepId.PROFILE)
    }

    @Test
    fun `un compte qui porte deja avatar et banniere saute la carte, meme devant une passerelle ancienne`() {
        assertThat(OnboardingProfileCard.isComplete("a", "b")).isTrue()
        assertThat(OnboardingProfileCard.isComplete("a", null)).isFalse()
        assertThat(OnboardingProfileCard.isComplete(" ", "b")).isFalse()
        assertThat(OnboardingFlowRules.pendingGestureSteps(served(), profileComplete = true))
            .doesNotContain(OnboardingStepId.PROFILE)
    }

    @Test
    fun `une image posee n'appelle pas la carte notifications`() {
        assertThat(OnboardingFlowRules.alreadyProduced(served(prefilled = listOf(OnboardingStepId.PROFILE)))).isFalse()
    }

    @Test
    fun `l'etape profile se lit du fil`() {
        val parsed = OnboardingStateParser.parse(
            Json.parseToJsonElement("""{"eligible":true,"seenSteps":["profile","later-step"],"prefilledSteps":["profile"]}"""),
        )

        assertThat(parsed?.seenSteps).containsExactly(OnboardingStepId.PROFILE)
        assertThat(parsed?.prefilledSteps).containsExactly(OnboardingStepId.PROFILE)
        assertThat(OnboardingStepUpdate.of(OnboardingStepId.PROFILE, OnboardingStepOutcome.DONE).step).isEqualTo("profile")
    }

    @Test
    fun `rien de pose - le geste principal dit Plus tard et vaut skipped`() {
        val card = OnboardingProfileCard.of(avatarUrl = "https://a/old.jpg", bannerUrl = null)

        assertThat(card.primary).isEqualTo(OnboardingProfilePrimary.LATER)
        assertThat(card.outcome).isEqualTo(OnboardingStepOutcome.SKIPPED)
        assertThat(card.avatar.shown).isEqualTo("https://a/old.jpg")
    }

    @Test
    fun `l'image choisie s'affiche aussitot puis l'adresse servie la remplace et l'etape vaut done`() {
        val picking = OnboardingProfileCard().picked(ImageUploadTarget.BANNER, "file:///cache/banner.jpg")

        assertThat(picking.banner.shown).isEqualTo("file:///cache/banner.jpg")
        assertThat(picking.isUploading).isTrue()
        assertThat(picking.primary).isEqualTo(OnboardingProfilePrimary.CONTINUE)
        assertThat(picking.outcome).isEqualTo(OnboardingStepOutcome.DONE)

        val done = picking.uploaded(ImageUploadTarget.BANNER, "https://cdn/banner.jpg")
        assertThat(done.banner.shown).isEqualTo("https://cdn/banner.jpg")
        assertThat(done.isUploading).isFalse()
        assertThat(done.primary).isEqualTo(OnboardingProfilePrimary.CONTINUE)
        assertThat(done.outcome).isEqualTo(OnboardingStepOutcome.DONE)
    }

    @Test
    fun `un echec rend l'image precedente et le dit`() {
        val failed = OnboardingProfileCard.of(avatarUrl = "https://a/old.jpg", bannerUrl = null)
            .picked(ImageUploadTarget.AVATAR, "file:///cache/avatar.jpg")
            .failed(ImageUploadTarget.AVATAR)

        assertThat(failed.avatar.shown).isEqualTo("https://a/old.jpg")
        assertThat(failed.avatar.failed).isTrue()
        assertThat(failed.outcome).isEqualTo(OnboardingStepOutcome.SKIPPED)
        assertThat(failed.failedTargets).containsExactly(ImageUploadTarget.AVATAR)
        assertThat(failed.picked(ImageUploadTarget.AVATAR, "file:///b.jpg").avatar.failed).isFalse()
    }

    @Test
    fun `un second choix pendant l'envoi est ignore`() {
        val picking = OnboardingProfileCard().picked(ImageUploadTarget.AVATAR, "file:///one.jpg")

        assertThat(picking.picked(ImageUploadTarget.AVATAR, "file:///two.jpg").avatar.shown).isEqualTo("file:///one.jpg")
        assertThat(picking.picked(ImageUploadTarget.BANNER, "file:///b.jpg").banner.shown).isEqualTo("file:///b.jpg")
    }
}
