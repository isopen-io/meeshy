package me.meeshy.sdk.model.scene.export

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryExportClipLoopTest {

    private fun sound(start: Long = 0, end: Long = 8_000, trimStart: Long = 0, trimEnd: Long? = null, loop: Boolean = false, gain: Float = 1f, envelope: List<StoryExportVolumePoint> = emptyList()) =
        StoryExportSound("a.m4a", StoryExportSoundRole.FOREGROUND_AUDIO, "a", start, end, trimStart, trimEnd, loop, gain, envelope)

    @Test fun `un son qui ne boucle pas entre a son heure et se lit une fois`() {
        val segments = StoryExportClipLoop.soundSegments(sound(start = 2_000, end = 22_000), clipDurationMillis = 5_000)
        assertThat(segments).containsExactly(StoryExportSoundSegment(clipStartMillis = 0, clipEndMillis = 5_000, leadMillis = 2_000, originMillis = 0))
    }

    @Test fun `un son qui boucle remplit sa fenetre de tours entiers puis d un tour coupe`() {
        val segments = StoryExportClipLoop.soundSegments(sound(start = 1_000, end = 9_000, loop = true), clipDurationMillis = 3_000)
        assertThat(segments).containsExactly(
            StoryExportSoundSegment(0, 3_000, 1_000, 0),
            StoryExportSoundSegment(0, 3_000, 0, 4_000),
            StoryExportSoundSegment(0, 2_000, 0, 7_000),
        ).inOrder()
    }

    @Test fun `la coupe de l auteur borne chaque tour`() {
        val segments = StoryExportClipLoop.soundSegments(sound(end = 5_000, trimStart = 1_000, trimEnd = 3_000, loop = true), clipDurationMillis = 10_000)
        assertThat(segments.map { it.clipStartMillis to it.clipEndMillis }).containsExactly(1_000L to 3_000L, 1_000L to 3_000L, 1_000L to 2_000L).inOrder()
    }

    @Test fun `une coupe vieillie hors du fichier relit le fichier entier`() {
        val segments = StoryExportClipLoop.soundSegments(sound(end = 4_000, trimStart = 9_000, trimEnd = 9_500), clipDurationMillis = 3_000)
        assertThat(segments).containsExactly(StoryExportSoundSegment(0, 3_000, 0, 0))
    }

    @Test fun `un fichier dont la duree n a pu se sonder se lit une fois sur sa fenetre, sans boucle`() {
        assertThat(StoryExportClipLoop.soundSegments(sound(start = 1_000, end = 5_000, trimStart = 500, loop = true), null))
            .containsExactly(StoryExportSoundSegment(500, 4_500, 1_000, 0))
        assertThat(StoryExportClipLoop.soundSegments(sound(end = 5_000, trimStart = 500, trimEnd = 2_000), null))
            .containsExactly(StoryExportSoundSegment(500, 2_000, 0, 0))
    }

    @Test fun `un son muet de bout en bout ne se lit pas`() {
        assertThat(StoryExportClipLoop.soundSegments(sound(gain = 0f), 3_000)).isEmpty()
        assertThat(StoryExportClipLoop.soundSegments(sound(gain = 0f, envelope = listOf(StoryExportVolumePoint(0, 0f), StoryExportVolumePoint(10, 0.5f))), 3_000)).hasSize(1)
    }

    @Test fun `une video de fond remplit sa slide de tours entiers`() {
        assertThat(StoryExportClipLoop.ranges(lengthMillis = 7_000, trimStartMillis = 0, trimEndMillis = null, clipDurationMillis = 3_000, loop = true))
            .containsExactly(StoryExportClipRange(0, 3_000), StoryExportClipRange(0, 3_000), StoryExportClipRange(0, 1_000)).inOrder()
        assertThat(StoryExportClipLoop.ranges(lengthMillis = 2_000, trimStartMillis = 500, trimEndMillis = null, clipDurationMillis = 3_000, loop = true))
            .containsExactly(StoryExportClipRange(500, 2_500))
    }

    @Test fun `la courbe se lit par interpolation lineaire, le gain fixe en son absence`() {
        val curve = listOf(StoryExportVolumePoint(1_000, 0f), StoryExportVolumePoint(2_000, 1f))
        assertThat(StoryExportVolumeCurve.gainAt(curve, 0.5f, 500)).isWithin(1e-4f).of(0f)
        assertThat(StoryExportVolumeCurve.gainAt(curve, 0.5f, 1_500)).isWithin(1e-4f).of(0.5f)
        assertThat(StoryExportVolumeCurve.gainAt(curve, 0.5f, 3_000)).isWithin(1e-4f).of(1f)
        assertThat(StoryExportVolumeCurve.gainAt(emptyList(), 0.5f, 3_000)).isWithin(1e-4f).of(0.5f)
    }
}
