package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.location.LocationAccess
import org.junit.Test

/** La feuille « Lieu » (#13846) : rien n'est choisi d'office, et après un refus aucun lieu n'est proposé. */
class StoryPlaceSheetStateTest {

    private val cafe = SharedPlace(48.0, 2.0, name = "Café")
    private val gare = SharedPlace(48.1, 2.1, name = "Gare")

    @Test
    fun `nothing is chosen by default, so OK stays greyed`() {
        val granted = StoryPlaceSheetState().withAccess(LocationAccess.GRANTED).withNearby(listOf(cafe, gare))
        assertThat(granted.proposed).containsExactly(cafe, gare).inOrder()
        assertThat(granted.selected).isNull()
        assertThat(granted.canConfirm).isFalse()
        assertThat(granted.chosen(gare).canConfirm).isTrue()
    }

    @Test
    fun `after a refusal no place is proposed, OK is greyed and the refusal is said`() {
        val refused = StoryPlaceSheetState().withNearby(listOf(cafe)).withAccess(LocationAccess.DENIED).withNearby(listOf(gare))
        assertThat(refused.proposed).isEmpty()
        assertThat(refused.canConfirm).isFalse()
        assertThat(refused.showsRefusal).isTrue()
        assertThat(StoryPlaceSheetState().withAccess(LocationAccess.GRANTED).showsRefusal).isFalse()
    }

    @Test
    fun `a refused author can still find a place by its name`() {
        val refused = StoryPlaceSheetState().withAccess(LocationAccess.DENIED).queried("gare").withResults("gare", listOf(gare))
        assertThat(refused.proposed).containsExactly(gare)
        assertThat(refused.chosen(gare).canConfirm).isTrue()
    }

    @Test
    fun `an answer for a query typed over is ignored, and clearing the query gives the nearby places back`() {
        val state = StoryPlaceSheetState().withAccess(LocationAccess.GRANTED).withNearby(listOf(cafe)).queried("ga")
        assertThat(state.queried("gar").withResults("ga", listOf(gare)).proposed).isEmpty()
        assertThat(state.queried("").proposed).containsExactly(cafe)
    }

    @Test
    fun `a place chosen then hidden by a new query is no longer confirmable`() {
        val state = StoryPlaceSheetState().withAccess(LocationAccess.GRANTED).withNearby(listOf(cafe)).chosen(cafe)
        assertThat(state.queried("gare").canConfirm).isFalse()
    }
}
