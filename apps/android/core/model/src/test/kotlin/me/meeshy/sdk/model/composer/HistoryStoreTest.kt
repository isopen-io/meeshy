package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class HistoryStoreTest {
    private fun storeOf(vararg states: Int, cap: Int = 50): HistoryStore<Int> =
        states.fold(HistoryStore<Int>(cap)) { store, s -> store.push(s).store }

    @Test
    fun `an empty store can neither undo nor redo`() {
        val s = HistoryStore<Int>()
        assertThat(s.canUndo).isFalse()
        assertThat(s.canRedo).isFalse()
        assertThat(s.undo()).isNull()
        assertThat(s.redo()).isNull()
    }

    @Test
    fun `the first state is the floor and a second one enables undo`() {
        val one = storeOf(1)
        assertThat(one.canUndo).isFalse()
        val two = storeOf(1, 2)
        assertThat(two.canUndo).isTrue()
        assertThat(two.canRedo).isFalse()
    }

    @Test
    fun `consecutive identical states do not create a step`() {
        val s = storeOf(1, 1, 1)
        assertThat(s.states).containsExactly(1)
        assertThat(s.push(1).evicted).isNull()
    }

    @Test
    fun `undo then redo walks the trajectory`() {
        val (undone, back) = storeOf(1, 2, 3).undo()!!
        assertThat(back).isEqualTo(2)
        assertThat(undone.canRedo).isTrue()
        val (redone, again) = undone.redo()!!
        assertThat(again).isEqualTo(3)
        assertThat(redone.canRedo).isFalse()
    }

    @Test
    fun `pushing after an undo truncates the redo branch`() {
        val undone = storeOf(1, 2, 3).undo()!!.store
        val pushed = undone.push(9).store
        assertThat(pushed.states).containsExactly(1, 2, 9).inOrder()
        assertThat(pushed.canRedo).isFalse()
    }

    @Test
    fun `the cap evicts the oldest state and returns it`() {
        var store = HistoryStore<Int>(cap = 3)
        val evictions = (1..5).map { n -> store.push(n).also { store = it.store }.evicted }
        assertThat(evictions).containsExactly(null, null, null, 1, 2).inOrder()
        assertThat(store.states).containsExactly(3, 4, 5).inOrder()
        assertThat(store.canUndo).isTrue()
    }

    @Test
    fun `the default cap is fifty steps`() {
        val store = (1..80).fold(HistoryStore<Int>()) { s, n -> s.push(n).store }
        assertThat(store.states).hasSize(50)
        assertThat(store.states.first()).isEqualTo(31)
    }

    @Test
    fun `replacing the current state coalesces a continuous gesture into one step`() {
        val s = storeOf(1, 2).replaceCurrent(5).replaceCurrent(6)
        assertThat(s.states).containsExactly(1, 6).inOrder()
        assertThat(s.canUndo).isTrue()
    }

    @Test
    fun `the current state is exposed`() {
        assertThat(storeOf(1, 2).current).isEqualTo(2)
        assertThat(HistoryStore<Int>().current).isNull()
    }
}
