package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFrameMoodReconcileTest {

    private val frames = CallFrameCatalogue.all

    @Test
    fun `les tranches couvrent 2, 3-4, 5-6 et 7-12 personnes`() {
        assertThat(CallFrameCatalogue.bucket(2)).isEqualTo(CallFrameBucket.DUO)
        assertThat(CallFrameCatalogue.bucket(3)).isEqualTo(CallFrameBucket.COMITE)
        assertThat(CallFrameCatalogue.bucket(4)).isEqualTo(CallFrameBucket.COMITE)
        assertThat(CallFrameCatalogue.bucket(6)).isEqualTo(CallFrameBucket.GROUPE)
        assertThat(CallFrameCatalogue.bucket(12)).isEqualTo(CallFrameBucket.TABLEE)
        assertThat(CallFrameCatalogue.bucket(1)).isNull()
        assertThat(CallFrameCatalogue.bucket(13)).isNull()
    }

    @Test
    fun `frames ne propose que les cadres de la tranche et de l ambiance`() {
        val four = CallFrameCatalogue.frames(forPeople = 4)
        assertThat(four).isNotEmpty()
        assertThat(four.map { it.bucket }.distinct()).containsExactly(CallFrameBucket.COMITE)

        val jovialFour = CallFrameCatalogue.frames(forPeople = 4, mood = CallFrameMood.JOVIAL)
        assertThat(jovialFour.map { it.mood }.distinct()).containsExactly(CallFrameMood.JOVIAL)
        assertThat(CallFrameCatalogue.frames(forPeople = 1)).isEmpty()
    }

    @Test
    fun `moods rend les ambiances servies dans l ordre canonique`() {
        val moods = CallFrameCatalogue.moods(forPeople = 2)
        assertThat(moods).isEqualTo(CallFrameMood.entries.filter { it in moods })
        assertThat(moods).isNotEmpty()
        assertThat(CallFrameCatalogue.moods(forPeople = 99)).isEmpty()
    }

    @Test
    fun `le cadre choisi est conserve quand il sert encore le nouveau nombre`() {
        val duo = frames.first { it.bucket == CallFrameBucket.COMITE }
        assertThat(CallFrameCatalogue.reconcile(duo.id, people = 4)).isEqualTo(duo)
    }

    @Test
    fun `le meme motif est retenu dans la nouvelle tranche`() {
        val reconciled = CallFrameCatalogue.reconcile("signature.aurore.duo", people = 3)!!
        assertThat(reconciled.id).isEqualTo("signature.aurore.comite")
    }

    @Test
    fun `sans le motif dans la tranche, le premier cadre de l ambiance`() {
        val frames = listOf(design("jovial.a.duo", CallFrameBucket.DUO), design("jovial.b.comite", CallFrameBucket.COMITE))

        val reconciled = CallFrameCatalogue.reconcile("jovial.a.duo", people = 3, among = frames)

        assertThat(reconciled?.id).isEqualTo("jovial.b.comite")
    }

    @Test
    fun `sans cadre dans l ambiance, rien et l hote retombe sur le classique`() {
        val frames = listOf(design("jovial.a.duo", CallFrameBucket.DUO), design("elegant.b.comite", CallFrameBucket.COMITE))

        assertThat(CallFrameCatalogue.reconcile("jovial.a.duo", people = 5, among = frames)).isNull()
        assertThat(CallFrameCatalogue.reconcile("inconnu.x.duo", people = 3, among = frames)).isNull()
    }

    private fun design(id: String, bucket: CallFrameBucket): CallFrameDesign {
        val template = CallFrameCatalogue.all.first()
        val parts = id.split(".")
        return template.copy(
            id = id,
            motif = parts.take(2).joinToString("."),
            mood = CallFrameMood.fromRaw(parts[0])!!,
            bucket = bucket,
        )
    }
}
