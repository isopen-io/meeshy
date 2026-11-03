package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ContentFetchFailure
import me.meeshy.sdk.model.ReferenceAccess
import org.junit.Test

class StoryNotificationTargetStateTest {
    private val now = 1_800_000_000_000L
    private val past = "2020-01-01T00:00:00Z"
    private val future = "2999-01-01T00:00:00Z"

    private fun post(expiresAt: String? = null, access: ReferenceAccess? = null) =
        ApiPost(id = "s1", expiresAt = expiresAt, referenceAccess = access)

    @Test
    fun `une story vivante est active`() {
        assertThat(StoryNotificationTargetResolver.stateFor(post(future), now)).isEqualTo(StoryNotificationTargetState.Active(post(future)))
    }

    @Test
    fun `une story sans echeance est active`() {
        assertThat(StoryNotificationTargetResolver.stateFor(post(), now)).isInstanceOf(StoryNotificationTargetState.Active::class.java)
    }

    @Test
    fun `une story expiree sans droit est expiree`() {
        assertThat(StoryNotificationTargetResolver.stateFor(post(past), now)).isEqualTo(StoryNotificationTargetState.Expired)
        assertThat(StoryNotificationTargetResolver.stateFor(post(past, ReferenceAccess.NONE), now))
            .isEqualTo(StoryNotificationTargetState.Expired)
    }

    @Test
    fun `le droit accorde ouvre une story expiree`() {
        val expired = post(past, ReferenceAccess.GRANTED)
        assertThat(StoryNotificationTargetResolver.stateFor(expired, now)).isEqualTo(StoryNotificationTargetState.Active(expired))
    }

    @Test
    fun `le droit consomme est distinct de expire`() {
        assertThat(StoryNotificationTargetResolver.stateFor(post(past, ReferenceAccess.CONSUMED), now))
            .isEqualTo(StoryNotificationTargetState.ExpiredConsumed)
    }

    @Test
    fun `le droit consomme prime sur une echeance future`() {
        assertThat(StoryNotificationTargetResolver.stateFor(post(future, ReferenceAccess.CONSUMED), now))
            .isEqualTo(StoryNotificationTargetState.ExpiredConsumed)
    }

    @Test
    fun `404 et 403 sont des reponses, reseau et serveur sont des pannes distinctes`() {
        assertThat(StoryNotificationTargetResolver.failureState(ContentFetchFailure.NOT_FOUND)).isEqualTo(StoryNotificationTargetState.Expired)
        assertThat(StoryNotificationTargetResolver.failureState(ContentFetchFailure.FORBIDDEN)).isEqualTo(StoryNotificationTargetState.Expired)
        assertThat(StoryNotificationTargetResolver.failureState(ContentFetchFailure.NETWORK)).isEqualTo(StoryNotificationTargetState.Offline)
        assertThat(StoryNotificationTargetResolver.failureState(ContentFetchFailure.SERVER)).isEqualTo(StoryNotificationTargetState.ServerFailed)
    }

    @Test
    fun `une reponse detenue n est pas ecrasee par un echec de revalidation`() {
        val held = StoryNotificationTargetState.Active(post(future))
        assertThat(StoryNotificationTargetResolver.afterFailedRevalidation(held, ContentFetchFailure.NETWORK)).isEqualTo(held)
        assertThat(StoryNotificationTargetResolver.afterFailedRevalidation(StoryNotificationTargetState.Expired, ContentFetchFailure.SERVER))
            .isEqualTo(StoryNotificationTargetState.Expired)
    }

    @Test
    fun `une panne precedente est remplacee par la nouvelle`() {
        assertThat(
            StoryNotificationTargetResolver.afterFailedRevalidation(StoryNotificationTargetState.Offline, ContentFetchFailure.SERVER),
        ).isEqualTo(StoryNotificationTargetState.ServerFailed)
        assertThat(
            StoryNotificationTargetResolver.afterFailedRevalidation(StoryNotificationTargetState.Loading, ContentFetchFailure.NETWORK),
        ).isEqualTo(StoryNotificationTargetState.Offline)
    }
}
