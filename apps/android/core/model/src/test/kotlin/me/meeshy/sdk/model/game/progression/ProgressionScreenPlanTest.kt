package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProgressionScreenPlanTest {

    @Test
    fun `a froid le squelette paraît et rien d autre`() {
        val plan = ProgressionScreenPlan.of(hasProgress = false, progressIsEmpty = false, failure = null, isLoading = true)

        assertThat(plan.showsSkeleton).isTrue()
        assertThat(plan.notices).isEmpty()
    }

    @Test
    fun `sur un instantane aucun squelette, meme pendant la revalidation`() {
        val plan = ProgressionScreenPlan.of(hasProgress = true, progressIsEmpty = false, failure = null, isLoading = true)

        assertThat(plan.showsSkeleton).isFalse()
    }

    @Test
    fun `hors ligne l instantane reste et l avis le dit`() {
        val plan = ProgressionScreenPlan.of(hasProgress = true, progressIsEmpty = false, failure = ProgressionFailure.Offline, isLoading = false)

        assertThat(plan.notices).containsExactly(ProgressionNotice.Offline(hasSnapshot = true))
    }

    @Test
    fun `hors ligne a froid l avis promet la reconnexion et le squelette s efface`() {
        val plan = ProgressionScreenPlan.of(hasProgress = false, progressIsEmpty = false, failure = ProgressionFailure.Offline, isLoading = true)

        assertThat(plan.showsSkeleton).isFalse()
        assertThat(plan.notices).containsExactly(ProgressionNotice.Offline(hasSnapshot = false))
    }

    @Test
    fun `un echec de la passerelle est un avis d erreur et non une coupure`() {
        val plan = ProgressionScreenPlan.of(hasProgress = false, progressIsEmpty = false, failure = ProgressionFailure.Server, isLoading = false)

        assertThat(plan.notices).containsExactly(ProgressionNotice.Error)
    }

    @Test
    fun `une charge sans activite dit l etat vide apres l avis de coupure`() {
        val plan = ProgressionScreenPlan.of(hasProgress = true, progressIsEmpty = true, failure = ProgressionFailure.Offline, isLoading = false)

        assertThat(plan.notices).containsExactly(ProgressionNotice.Offline(true), ProgressionNotice.Empty).inOrder()
    }
}
