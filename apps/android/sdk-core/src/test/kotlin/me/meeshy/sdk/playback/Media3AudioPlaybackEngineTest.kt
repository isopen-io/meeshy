package me.meeshy.sdk.playback

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.media.StretchEnd
import me.meeshy.sdk.model.playback.PlaybackCommandOrigin
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class Media3AudioPlaybackEngineTest {

    private class Rig(scope: TestScope) {
        val port = FakeAudioPlayerPort()
        val store = InMemoryPositionStore()
        val sink = RecordingSink()
        var call = false
        val engine = Media3AudioPlaybackEngine(
            portFactory = { port },
            positions = store,
            reportSink = sink,
            callActive = { call },
            dispatcher = StandardTestDispatcher(scope.testScheduler),
            nowEpochMs = { 1_000L },
        )
    }

    private fun rig(scope: TestScope) = Rig(scope)

    private fun Rig.playing(id: String = "a", durationMs: Long = 30_000L) {
        engine.play(id, "https://cdn/$id.mp3")
        port.prepare(durationMs)
    }

    @Test fun `jouer un vocal le charge, puis la preparation lance la lecture`() = runTest {
        val rig = rig(this)

        rig.engine.play("a", "https://cdn/a.mp3")
        assertThat(rig.engine.state.value.isLoading).isTrue()
        assertThat(rig.engine.state.value.attachmentId).isEqualTo("a")

        rig.port.prepare(12_000L)

        assertThat(rig.engine.state.value.isPlaying).isTrue()
        assertThat(rig.engine.state.value.isLoading).isFalse()
        assertThat(rig.engine.state.value.durationMs).isEqualTo(12_000L)
        assertThat(rig.port.playing).isTrue()
    }

    @Test fun `jouer B pendant que A joue arrete A et bascule l'identifiant atomiquement`() = runTest {
        val rig = rig(this)
        rig.playing("a")

        rig.engine.play("b", "https://cdn/b.mp3")

        assertThat(rig.engine.state.value.attachmentId).isEqualTo("b")
        assertThat(rig.engine.state.value.isPlaying).isFalse()
        assertThat(rig.engine.state.value.isLoading).isTrue()
        assertThat(rig.port.stops).isAtLeast(1)
    }

    @Test fun `la preparation d'un chargement remplace est ignoree`() = runTest {
        val rig = rig(this)
        rig.engine.play("a", "https://cdn/a.mp3")
        val staleGeneration = rig.port.lastGeneration
        rig.engine.play("b", "https://cdn/b.mp3")

        rig.port.prepare(9_000L, generation = staleGeneration)

        assertThat(rig.engine.state.value.isPlaying).isFalse()
        assertThat(rig.engine.state.value.isLoading).isTrue()
        assertThat(rig.engine.state.value.attachmentId).isEqualTo("b")
    }

    @Test fun `la position du vocal remplace est sauvee au changement de piste`() = runTest {
        val rig = rig(this)
        rig.playing("a", durationMs = 30_000L)
        rig.port.position = 12_000L

        rig.engine.play("b", "https://cdn/b.mp3")

        assertThat(rig.store.map["a"]?.positionMs).isEqualTo(12_000L)
    }

    @Test fun `une position collee au bord n'est pas memorisee et efface la precedente`() = runTest {
        val rig = rig(this)
        rig.store.save("a", 5_000L, 1L)
        rig.playing("a", durationMs = 30_000L)
        rig.port.position = 500L

        rig.engine.pause()

        assertThat(rig.store.map).doesNotContainKey("a")
    }

    @Test fun `la lecture reprend a la position memorisee avant de jouer`() = runTest {
        val rig = rig(this)
        rig.store.save("a", 10_000L, 1L)

        rig.playing("a", durationMs = 30_000L)

        assertThat(rig.port.seeks).containsExactly(10_000L)
        assertThat(rig.engine.state.value.currentTimeMs).isEqualTo(10_000L)
    }

    @Test fun `la consommation servie comble l'absence locale mais pas celle d'une autre piece jointe`() = runTest {
        val rig = rig(this)
        rig.engine.setServedConsumption("a", MeeshyMediaConsumption(lastPlayPositionMs = 8_000))

        rig.playing("b", durationMs = 30_000L)
        assertThat(rig.port.seeks).isEmpty()

        rig.playing("a", durationMs = 30_000L)
        assertThat(rig.port.seeks).containsExactly(8_000L)
    }

    @Test fun `un appel actif refuse le demarrage mais jamais l'arret`() = runTest {
        val rig = rig(this)
        rig.playing("a")
        rig.call = true

        val accepted = rig.engine.play("b", "https://cdn/b.mp3")

        assertThat(accepted).isFalse()
        assertThat(rig.engine.state.value.attachmentId).isEqualTo("a")
        rig.engine.pause()
        assertThat(rig.engine.state.value.isPlaying).isFalse()
        rig.engine.stop()
        assertThat(rig.engine.state.value.hasTrack).isFalse()
    }

    @Test fun `un appel actif bloque la reprise`() = runTest {
        val rig = rig(this)
        rig.playing("a")
        rig.engine.pause()
        rig.call = true

        rig.engine.togglePlayPause()
        rig.engine.resumeFromInterruption()

        assertThat(rig.engine.state.value.isPlaying).isFalse()
        assertThat(rig.port.playing).isFalse()
    }

    @Test fun `un redemarrage du lecteur pendant un appel est recoupe`() = runTest {
        val rig = rig(this)
        rig.playing("a")
        rig.port.playWhenReady(false)
        rig.call = true

        rig.port.playWhenReady(true)

        assertThat(rig.engine.state.value.isPlaying).isFalse()
        assertThat(rig.port.playing).isFalse()
    }

    @Test fun `le focus rendu reprend ce que l'interruption avait suspendu`() = runTest {
        val rig = rig(this)
        rig.playing("a")

        rig.port.playWhenReady(false)
        assertThat(rig.engine.state.value.isPlaying).isFalse()
        rig.port.playWhenReady(true)

        assertThat(rig.engine.state.value.isPlaying).isTrue()
    }

    @Test fun `le cycle de vitesse boucle et persiste d'une piste a l'autre`() = runTest {
        val rig = rig(this)
        rig.playing("a")

        rig.engine.cycleSpeed()
        assertThat(rig.engine.state.value.speed).isEqualTo(PlaybackSpeed.X1_25)
        assertThat(rig.port.currentSpeed).isEqualTo(1.25f)

        rig.engine.play("b", "https://cdn/b.mp3")
        assertThat(rig.port.loads.last().third).isEqualTo(1.25f)

        repeat(PlaybackSpeed.entries.size - 1) { rig.engine.cycleSpeed() }
        assertThat(rig.engine.state.value.speed).isEqualTo(PlaybackSpeed.X1_0)
    }

    @Test fun `un fichier local se joue par la meme voie`() = runTest {
        val rig = rig(this)

        rig.engine.playLocal("tmp", "file:///cache/voice.m4a")

        assertThat(rig.port.loads.last().first).isEqualTo(AudioSource.Local("file:///cache/voice.m4a"))
    }

    @Test fun `une source illisible remet le chargement a faux sans planter et libere la file`() = runTest {
        val rig = rig(this)
        val finished = mutableListOf<AudioEngineEvent>()
        val collector = backgroundScope.launchCollect(rig.engine.events, finished)
        runCurrent()
        rig.engine.play("a", "https://cdn/a.mp3")

        rig.port.fail()
        runCurrent()

        assertThat(rig.engine.state.value.isLoading).isFalse()
        assertThat(rig.engine.state.value.isPlaying).isFalse()
        assertThat(finished).containsExactly(AudioEngineEvent.Finished("a", completed = false))
        collector.cancel()
    }

    @Test fun `un chargement refuse par le lecteur n'echappe pas`() = runTest {
        val rig = rig(this)
        rig.port.failNextLoad = true

        rig.engine.play("a", "https://cdn/a.mp3")

        assertThat(rig.engine.state.value.isLoading).isFalse()
    }

    @Test fun `une url vide ne charge rien`() = runTest {
        val rig = rig(this)

        assertThat(rig.engine.play("a", "  ")).isFalse()
        assertThat(rig.port.loads).isEmpty()
    }

    @Test fun `la progression n'est echantillonnee que pendant la lecture`() = runTest {
        val rig = rig(this)
        rig.playing("a")

        rig.port.position = 3_000L
        advanceTimeBy(150L)
        assertThat(rig.engine.state.value.currentTimeMs).isEqualTo(3_000L)

        rig.engine.pause()
        rig.port.position = 9_000L
        advanceTimeBy(500L)
        assertThat(rig.engine.state.value.currentTimeMs).isEqualTo(3_000L)
    }

    @Test fun `la fin naturelle rapporte complete une seule fois, efface la reprise et annonce la fin`() = runTest {
        val rig = rig(this)
        val finished = mutableListOf<AudioEngineEvent>()
        val collector = backgroundScope.launchCollect(rig.engine.events, finished)
        runCurrent()
        rig.store.save("a", 10_000L, 1L)
        rig.playing("a", durationMs = 20_000L)
        rig.port.position = 20_000L

        rig.port.end()
        rig.port.end()
        runCurrent()

        val reports = rig.sink.reports.map { it.second }
        assertThat(reports).hasSize(1)
        assertThat(reports.single().complete).isTrue()
        assertThat(reports.single().stretches!!.last().endedBy).isEqualTo(StretchEnd.COMPLETED)
        assertThat(rig.store.map).doesNotContainKey("a")
        assertThat(finished).containsExactly(AudioEngineEvent.Finished("a", completed = true))
        collector.cancel()
    }

    @Test fun `en boucle la fin naturelle rejoue sans liberer le lecteur`() = runTest {
        val rig = rig(this)
        rig.playing("a")
        rig.engine.setLoop(true)

        rig.port.end()

        assertThat(rig.engine.state.value.isPlaying).isTrue()
        assertThat(rig.port.seeks.last()).isEqualTo(0L)
        assertThat(rig.port.playing).isTrue()
    }

    @Test fun `un saut de curseur coupe l'ecoute en deux plages`() = runTest {
        val rig = rig(this)
        rig.playing("a", durationMs = 30_000L)
        rig.port.position = 4_000L

        rig.engine.seekToMs(20_000L)
        rig.port.position = 22_000L
        rig.engine.pause()

        val stretches = rig.sink.reports.last().second.stretches!!
        assertThat(stretches.map { it.endedBy }).containsExactly(StretchEnd.SEEK, StretchEnd.PAUSE).inOrder()
        assertThat(stretches.first().endMs).isEqualTo(4_000)
        assertThat(stretches.last().startMs).isEqualTo(20_000)
    }

    @Test fun `changer de vocal en cours d'ecoute rapporte une ecoute abandonnee`() = runTest {
        val rig = rig(this)
        rig.playing("a")
        rig.port.position = 6_000L

        rig.engine.play("b", "https://cdn/b.mp3")

        val (id, body) = rig.sink.reports.single()
        assertThat(id).isEqualTo("a")
        assertThat(body.complete).isFalse()
        assertThat(body.stretches!!.single().endedBy).isEqualTo(StretchEnd.DISMISSED)
    }

    @Test fun `l'origine d'une commande n'exempte pas de la garde d'appel`() = runTest {
        val rig = rig(this)
        rig.call = true

        PlaybackCommandOrigin.entries.forEach { origin ->
            assertThat(rig.engine.play("a", "https://cdn/a.mp3", origin)).isFalse()
        }
    }
}
