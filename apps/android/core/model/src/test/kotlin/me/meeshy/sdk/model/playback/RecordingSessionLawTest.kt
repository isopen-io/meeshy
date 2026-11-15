package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Port de `RecordingSessionLawTests` (iOS, #11042) : enregistrer dans Meeshy coupe les sons
 * exterieurs, garde le son Meeshy qui joue (plus bas), puis rend la session.
 */
class RecordingSessionLawTest {

    private val everyCase = RecordingSource.entries.flatMap { source ->
        listOf(false, true).map { playing -> source to playing }
    }

    @Test
    fun `tout enregistrement est une session de lecture et d'enregistrement non melangeable`() {
        everyCase.forEach { (source, playing) ->
            val configuration = RecordingSessionLaw.configuration(source, meeshySoundPlaying = playing)

            assertThat(configuration.category).isEqualTo(SessionCategory.PlayAndRecord)
            assertThat(configuration.mixing).isEqualTo(SessionMixing.NonMixable)
            assertThat(configuration.defaultsToSpeaker).isTrue()
        }
    }

    @Test
    fun `un vocal seul garde le traitement de la voix du systeme`() {
        val configuration = RecordingSessionLaw.configuration(RecordingSource.VoiceMessage, meeshySoundPlaying = false)

        assertThat(configuration.mode).isEqualTo(RecordingAudioMode.VoiceProcessing)
        assertThat(configuration.bluetooth).isEqualTo(RecordingBluetoothProfile.HandsFree)
    }

    @Test
    fun `un vocal par-dessus un son Meeshy abandonne le traitement qui l'etoufferait`() {
        val configuration = RecordingSessionLaw.configuration(RecordingSource.VoiceMessage, meeshySoundPlaying = true)

        assertThat(configuration.mode).isEqualTo(RecordingAudioMode.Standard)
        assertThat(configuration.bluetooth).isEqualTo(RecordingBluetoothProfile.HandsFree)
    }

    @Test
    fun `une video s'enregistre en mode video avec une sortie Bluetooth haute qualite`() {
        listOf(false, true).forEach { playing ->
            val configuration = RecordingSessionLaw.configuration(RecordingSource.Video, meeshySoundPlaying = playing)

            assertThat(configuration.mode).isEqualTo(RecordingAudioMode.VideoCapture)
            assertThat(configuration.bluetooth).isEqualTo(RecordingBluetoothProfile.HighQualityOutput)
        }
    }

    @Test
    fun `apres l'enregistrement un son Meeshy encore en lecture retrouve sa session de contenu`() {
        assertThat(RecordingSessionLaw.handBack(meeshySoundStillPlaying = true))
            .isEqualTo(RecordingSessionHandBack.ReturnToContentPlayback)
    }

    @Test
    fun `apres l'enregistrement sans rien en lecture la session est rendue aux autres applications`() {
        assertThat(RecordingSessionLaw.handBack(meeshySoundStillPlaying = false))
            .isEqualTo(RecordingSessionHandBack.ReleaseSession)
    }

    @Test
    fun `la session ne se rend que si elle est encore celle de l'enregistrement`() {
        assertThat(RecordingSessionLaw.mayReleaseSession(SessionCategory.PlayAndRecord)).isTrue()
        assertThat(RecordingSessionLaw.mayReleaseSession(SessionCategory.Playback)).isFalse()
        assertThat(RecordingSessionLaw.mayReleaseSession(SessionCategory.Ambient)).isFalse()
    }

    @Test
    fun `pendant un enregistrement aucun lecteur de contenu ne reconfigure la session`() {
        assertThat(RecordingSessionLaw.contentMayReconfigureSession(recordingHoldsSession = true)).isFalse()
        assertThat(RecordingSessionLaw.contentMayReconfigureSession(recordingHoldsSession = false)).isTrue()
    }
}
