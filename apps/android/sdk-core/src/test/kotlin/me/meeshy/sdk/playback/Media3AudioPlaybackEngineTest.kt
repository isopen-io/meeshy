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

    /**
     * Le moteur tourne sur l'horloge virtuelle du test : son ticker de position (une boucle `delay`) ne s'arrête qu'à la
     * libération. Sans elle, la fin de `runTest`, qui avance jusqu'au repos, avançait ce ticker sans fin.
     */
    private fun engineTest(body: suspend TestScope.(Rig) -> Unit) = runTest {
        val rig = rig(this)
        try {
            body(rig)
        } finally {
            rig.engine.release()
        }
    }

    private fun Rig.playing(id: String = "a", durationMs: Long = 30_000L) {
        engine.play(id, "https://cdn/$id.mp3", isProtected = false)
        port.prepare(durationMs)
    }

    private fun Rig.playWhenReady(value: Boolean) = port.playWhenReady(value)

    @Test fun `un vocal protege est charge comme protege, un vocal public comme public`() = engineTest { rig ->
        rig.engine.play("a", "https://cdn/a.mp3", isProtected = true)
        assertThat(rig.port.loads.last().first).isEqualTo(AudioSource.Remote("https://cdn/a.mp3", isProtected = true))

        rig.engine.play("b", "https://cdn/b.mp3", isProtected = false)
        assertThat(rig.port.loads.last().first).isEqualTo(AudioSource.Remote("https://cdn/b.mp3", isProtected = false))
    }

    @Test fun `jouer un vocal le charge, puis la preparation lance la lecture`() = engineTest { rig ->

        rig.engine.play("a", "https://cdn/a.mp3", isProtected = false)
        assertThat(rig.engine.state.value.isLoading).isTrue()
        assertThat(rig.engine.state.value.attachmentId).isEqualTo("a")

        rig.port.prepare(12_000L)

        assertThat(rig.engine.state.value.isPlaying).isTrue()
        assertThat(rig.engine.state.value.isLoading).isFalse()
        assertThat(rig.engine.state.value.durationMs).isEqualTo(12_000L)
        assertThat(rig.port.playing).isTrue()
    }

    @Test fun `jouer B pendant que A joue arrete A et bascule l'identifiant atomiquement`() = engineTest { rig ->
        rig.playing("a")

        rig.engine.play("b", "https://cdn/b.mp3", isProtected = false)

        assertThat(rig.engine.state.value.attachmentId).isEqualTo("b")
        assertThat(rig.engine.state.value.isPlaying).isFalse()
        assertThat(rig.engine.state.value.isLoading).isTrue()
        assertThat(rig.port.stops).isAtLeast(1)
    }

    @Test fun `la preparation d'un chargement remplace est ignoree`() = engineTest { rig ->
        rig.engine.play("a", "https://cdn/a.mp3", isProtected = false)
        val staleGeneration = rig.port.lastGeneration
        rig.engine.play("b", "https://cdn/b.mp3", isProtected = false)

        rig.port.prepare(9_000L, generation = staleGeneration)

        assertThat(rig.engine.state.value.isPlaying).isFalse()
        assertThat(rig.engine.state.value.isLoading).isTrue()
        assertThat(rig.engine.state.value.attachmentId).isEqualTo("b")
    }

    @Test fun `la position du vocal remplace est sauvee au changement de piste`() = engineTest { rig ->
        rig.playing("a", durationMs = 30_000L)
        rig.port.position = 12_000L

        rig.engine.play("b", "https://cdn/b.mp3", isProtected = false)

        assertThat(rig.store.map["a"]?.positionMs).isEqualTo(12_000L)
    }

    @Test fun `une position collee au bord n'est pas memorisee et efface la precedente`() = engineTest { rig ->
        rig.store.save("a", 5_000L, 1L)
        rig.playing("a", durationMs = 30_000L)
        rig.port.position = 500L

        rig.engine.pause()

        assertThat(rig.store.map).doesNotContainKey("a")
    }

    @Test fun `la lecture reprend a la position memorisee avant de jouer`() = engineTest { rig ->
        rig.store.save("a", 10_000L, 1L)

        rig.playing("a", durationMs = 30_000L)

        assertThat(rig.port.seeks).containsExactly(10_000L)
        assertThat(rig.engine.state.value.currentTimeMs).isEqualTo(10_000L)
    }

    @Test fun `la consommation servie comble l'absence locale mais pas celle d'une autre piece jointe`() = engineTest { rig ->
        rig.engine.setServedConsumption("a", MeeshyMediaConsumption(lastPlayPositionMs = 8_000))

        rig.playing("b", durationMs = 30_000L)
        assertThat(rig.port.seeks).isEmpty()

        rig.playing("a", durationMs = 30_000L)
        assertThat(rig.port.seeks).containsExactly(8_000L)
    }

    @Test fun `un appel actif refuse le demarrage mais jamais l'arret`() = engineTest { rig ->
        rig.playing("a")
        rig.call = true

        val accepted = rig.engine.play("b", "https://cdn/b.mp3", isProtected = false)

        assertThat(accepted).isFalse()
        assertThat(rig.engine.state.value.attachmentId).isEqualTo("a")
        rig.engine.pause()
        assertThat(rig.engine.state.value.isPlaying).isFalse()
        rig.engine.stop()
        assertThat(rig.engine.state.value.hasTrack).isFalse()
    }

    @Test fun `un appel actif bloque la reprise`() = engineTest { rig ->
        rig.playing("a")
        rig.engine.pause()
        rig.call = true

        rig.engine.togglePlayPause()
        rig.engine.resumeFromInterruption()

        assertThat(rig.engine.state.value.isPlaying).isFalse()
        assertThat(rig.port.playing).isFalse()
    }

    @Test fun `un redemarrage du lecteur pendant un appel est recoupe`() = engineTest { rig ->
        rig.playing("a")
        rig.playWhenReady(false)
        rig.call = true

        rig.playWhenReady(true)

        assertThat(rig.engine.state.value.isPlaying).isFalse()
        assertThat(rig.port.playing).isFalse()
    }

    @Test fun `le focus rendu reprend ce que l'interruption avait suspendu`() = engineTest { rig ->
        rig.playing("a")

        rig.playWhenReady(false)
        assertThat(rig.engine.state.value.isPlaying).isFalse()
        rig.playWhenReady(true)

        assertThat(rig.engine.state.value.isPlaying).isTrue()
    }

    @Test fun `le cycle de vitesse boucle et persiste d'une piste a l'autre`() = engineTest { rig ->
        rig.playing("a")

        rig.engine.cycleSpeed()
        assertThat(rig.engine.state.value.speed).isEqualTo(PlaybackSpeed.X1_25)
        assertThat(rig.port.speed).isEqualTo(1.25f)

        rig.engine.play("b", "https://cdn/b.mp3", isProtected = false)
        assertThat(rig.port.loads.last().third).isEqualTo(1.25f)

        repeat(PlaybackSpeed.entries.size - 1) { rig.engine.cycleSpeed() }
        assertThat(rig.engine.state.value.speed).isEqualTo(PlaybackSpeed.X1_0)
    }

    @Test fun `un fichier local se joue par la meme voie`() = engineTest { rig ->

        rig.engine.playLocal("tmp", "file:///cache/voice.m4a")

        assertThat(rig.port.loads.last().first).isEqualTo(AudioSource.Local("file:///cache/voice.m4a"))
    }

    @Test fun `une source illisible remet le chargement a faux sans planter et libere la file`() = engineTest { rig ->
        val finished = mutableListOf<AudioEngineEvent>()
        val collector = backgroundScope.launchCollect(rig.engine.events, finished)
        runCurrent()
        rig.engine.play("a", "https://cdn/a.mp3", isProtected = false)

        rig.port.fail()
        runCurrent()

        assertThat(rig.engine.state.value.isLoading).isFalse()
        assertThat(rig.engine.state.value.isPlaying).isFalse()
        assertThat(finished).containsExactly(AudioEngineEvent.Finished("a", completed = false))
        collector.cancel()
    }

    @Test fun `un chargement refuse par le lecteur n'echappe pas`() = engineTest { rig ->
        rig.port.failNextLoad = true

        rig.engine.play("a", "https://cdn/a.mp3", isProtected = false)

        assertThat(rig.engine.state.value.isLoading).isFalse()
    }

    @Test fun `une url vide ne charge rien`() = engineTest { rig ->

        assertThat(rig.engine.play("a", "  ", isProtected = false)).isFalse()
        assertThat(rig.port.loads).isEmpty()
    }

    @Test fun `la progression n'est echantillonnee que pendant la lecture`() = engineTest { rig ->
        rig.playing("a")

        rig.port.position = 3_000L
        advanceTimeBy(150L)
        assertThat(rig.engine.state.value.currentTimeMs).isEqualTo(3_000L)

        rig.engine.pause()
        rig.port.position = 9_000L
        advanceTimeBy(500L)
        assertThat(rig.engine.state.value.currentTimeMs).isEqualTo(3_000L)
    }

    @Test fun `la fin naturelle rapporte complete une seule fois, efface la reprise et annonce la fin`() = engineTest { rig ->
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

    @Test fun `en boucle la fin naturelle rejoue sans liberer le lecteur`() = engineTest { rig ->
        rig.playing("a")
        rig.engine.setLoop(true)

        rig.port.end()

        assertThat(rig.engine.state.value.isPlaying).isTrue()
        assertThat(rig.port.seeks.last()).isEqualTo(0L)
        assertThat(rig.port.playing).isTrue()
    }

    @Test fun `un saut de curseur coupe l'ecoute en deux plages`() = engineTest { rig ->
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

    @Test fun `changer de vocal en cours d'ecoute rapporte une ecoute abandonnee`() = engineTest { rig ->
        rig.playing("a")
        rig.port.position = 6_000L

        rig.engine.play("b", "https://cdn/b.mp3", isProtected = false)

        val (id, body) = rig.sink.reports.single()
        assertThat(id).isEqualTo("a")
        assertThat(body.complete).isFalse()
        assertThat(body.stretches!!.single().endedBy).isEqualTo(StretchEnd.DISMISSED)
    }

    @Test fun `l'origine d'une commande n'exempte pas de la garde d'appel`() = engineTest { rig ->
        rig.call = true

        PlaybackCommandOrigin.entries.forEach { origin ->
            assertThat(rig.engine.play("a", "https://cdn/a.mp3", origin, isProtected = false)).isFalse()
        }
    }

    // ── #15969 : le vocal joué PENDANT son accusé ────────────────────────────────────────────────

    private val served = "https://gate.meeshy.me/api/v1/static/voice.m4a"

    private fun Rig.listeningToPending() {
        engine.playLocal("cmid_voice", "file:///data/cache/pending-previews/cmid_voice.voice.m4a")
        port.prepare(14_000L)
        port.position = 5_000L
    }

    @Test fun `le vocal accuse continue sous son id serveur, au meme point, sans rechargement`() = engineTest { rig ->
        rig.listeningToPending()

        rig.engine.follow("cmid_voice", "att_server", served, isProtected = false)

        assertThat(rig.engine.state.value.attachmentId).isEqualTo("att_server")
        assertThat(rig.engine.state.value.isPlaying).isTrue()
        assertThat(rig.port.loads).hasSize(1)
        assertThat(rig.port.playing).isTrue()
    }

    @Test fun `la copie locale disparue, le vocal reprend au meme point sur l'adresse servie`() = engineTest { rig ->
        rig.listeningToPending()
        rig.engine.follow("cmid_voice", "att_server", served, isProtected = false)

        rig.port.fail()
        rig.port.prepare(14_000L)

        assertThat(rig.port.loads.map { it.first })
            .containsExactly(AudioSource.Local("file:///data/cache/pending-previews/cmid_voice.voice.m4a"), AudioSource.Remote(served, isProtected = false))
            .inOrder()
        assertThat(rig.port.seeks.last()).isEqualTo(5_000L)
        assertThat(rig.port.playing).isTrue()
        assertThat(rig.engine.state.value.isPlaying).isTrue()
        assertThat(rig.engine.state.value.attachmentId).isEqualTo("att_server")
    }

    @Test fun `un vocal en pause pendant son accuse reste en pause apres le reciblage`() = engineTest { rig ->
        rig.listeningToPending()
        rig.engine.follow("cmid_voice", "att_server", served, isProtected = false)
        rig.engine.pause()

        rig.port.fail()
        rig.port.prepare(14_000L)

        assertThat(rig.port.seeks.last()).isEqualTo(5_000L)
        assertThat(rig.port.playing).isFalse()
        assertThat(rig.engine.state.value.isPlaying).isFalse()
        assertThat(rig.engine.state.value.attachmentId).isEqualTo("att_server")
    }

    @Test fun `une pause pendant le reciblage est respectee a la reprise`() = engineTest { rig ->
        rig.listeningToPending()
        rig.engine.follow("cmid_voice", "att_server", served, isProtected = false)
        rig.port.fail()

        rig.engine.pause()
        rig.port.prepare(14_000L)

        assertThat(rig.port.seeks.last()).isEqualTo(5_000L)
        assertThat(rig.port.playing).isFalse()
        assertThat(rig.engine.state.value.isPlaying).isFalse()
    }

    @Test fun `un vocal protege accuse est recible sans cache disque`() = engineTest { rig ->
        rig.listeningToPending()
        rig.engine.follow("cmid_voice", "att_server", served, isProtected = true)

        rig.port.fail()

        assertThat(rig.port.loads.last().first).isEqualTo(AudioSource.Remote(served, isProtected = true))
    }

    @Test fun `une adresse servie qui echoue aussi est un vrai echec, jamais une boucle`() = engineTest { rig ->
        rig.listeningToPending()
        rig.engine.follow("cmid_voice", "att_server", served, isProtected = false)

        rig.port.fail()
        rig.port.fail()

        assertThat(rig.port.loads).hasSize(2)
        assertThat(rig.engine.state.value.isPlaying).isFalse()
        assertThat(rig.engine.state.value.isLoading).isFalse()
    }

    @Test fun `un autre vocal n'est jamais pris pour le vocal accuse`() = engineTest { rig ->
        rig.listeningToPending()

        rig.engine.follow("cmid_other", "att_server", served, isProtected = false)
        rig.port.fail()

        assertThat(rig.engine.state.value.attachmentId).isEqualTo("cmid_voice")
        assertThat(rig.port.loads).hasSize(1)
        assertThat(rig.engine.state.value.isPlaying).isFalse()
    }
}
