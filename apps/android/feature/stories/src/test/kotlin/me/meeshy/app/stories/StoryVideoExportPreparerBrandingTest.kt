package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.export.StoryExportIdentity
import me.meeshy.sdk.model.scene.export.StoryExportMode
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** #13509 : une story exportée s'ouvre sur son intro et se ferme sur sa carte, avec mood, présence, logo de cercle et jingles. */
class StoryVideoExportPreparerBrandingTest {

    @get:Rule val folder = TemporaryFolder()

    private val base = "https://gate.meeshy.me"

    private val item = StoryItem(
        id = "story-1",
        storyEffects = StoryEffects(textObjects = listOf(StoryTextObject(id = "t", text = "Salut", startTime = 1.0, duration = 3.0))),
    )

    private val slide = StorySlideView(id = "story-1", text = "", isTranslated = false, imageUrl = null, accentHex = "112233")

    private val identity = StoryExportIdentity(
        displayName = "Aïcha", username = "aicha", avatarUrl = "https://x/a.png", bannerUrl = null, accentHex = "6366F1",
        moodEmoji = "😴", moodMessage = "sieste", presence = PresenceState.AWAY, badge = "🔥",
    )

    private class Recorder {
        val requests = mutableListOf<StoryExportBrandPaintRequest>()
        val fetched = mutableListOf<String>()
    }

    private fun preparer(
        recorder: Recorder,
        brand: Boolean = true,
        painted: Boolean = true,
        failing: Set<String> = emptySet(),
    ) = StoryVideoExportPreparer(
        fetch = { url, target ->
            recorder.fetched += url
            if (failing.any { url.endsWith(it) }) throw java.io.IOException("refus")
            target.writeText(url.substringAfterLast('/'))
        },
        probeMillis = { null },
        blankPicture = { it.writeText("noir") },
        chooseLength = { null },
        paint = { request -> request.frames.mapIndexed { i, _ -> File(request.directory, "calque-$i.png").also { it.writeText("png") } } },
        paintBrand = if (!brand) null else { request ->
            recorder.requests += request
            if (!painted) null else StoryExportBrandCards(
                intro = File(request.directory, "intro.png").also { it.writeText("i") },
                outro = File(request.directory, "fin.png").also { it.writeText("f") },
                author = File(request.directory, "auteur.png").also { it.writeText("a") },
            )
        },
    )

    private suspend fun prepare(preparer: StoryVideoExportPreparer, identity: StoryExportIdentity?) = preparer.prepare(
        StoryExportMode.SAVE, listOf(StoryExportScene.of(item, slide, base)), folder.newFile(), folder.newFolder(), identity,
    )

    @Test fun `la story s ouvre sur son intro, ses calques suivent le decalage, le contenu d intro porte mood, presence et logo`() = runTest {
        val recorder = Recorder()
        val branded = prepare(preparer(recorder), identity)
        val unbranded = prepare(preparer(Recorder()), null)

        val request = recorder.requests.single()
        assertThat(request.identity.badge).isEqualTo("🔥")
        assertThat(request.identity.presence).isEqualTo(PresenceState.AWAY)
        assertThat(request.identity.moodEmoji).isEqualTo("😴")
        assertThat(request.withIntro).isTrue()
        assertThat(request.withAuthorCard).isTrue()
        val brandedPlan = branded.branding!!.plan
        assertThat(brandedPlan.storyStartMillis).isEqualTo(1_200)
        assertThat(branded.overlays.map { it.startMillis }).isEqualTo(unbranded.overlays.map { it.startMillis + 1_200 })
        assertThat(branded.overlays.map { it.endMillis }).isEqualTo(unbranded.overlays.map { it.endMillis + 1_200 })
        assertThat(branded.plan.totalMillis).isEqualTo(unbranded.plan.totalMillis)
        assertThat(branded.still).isNull()
    }

    @Test fun `les deux jingles sont ecrits en WAV pour le moteur`() = runTest {
        val branding = prepare(preparer(Recorder()), identity).branding!!
        assertThat(branding.introJingle!!.readBytes().copyOfRange(0, 4).decodeToString()).isEqualTo("RIFF")
        assertThat(branding.outroJingle.readBytes().copyOfRange(8, 12).decodeToString()).isEqualTo("WAVE")
        assertThat(branding.introJingleMillis).isEqualTo(2_200)
        assertThat(branding.outroJingleMillis).isEqualTo(2_000)
    }

    @Test fun `l avatar de l auteur est rapatrie pour la peinture, un echec le remplace par l aplat`() = runTest {
        val ok = Recorder()
        prepare(preparer(ok), identity)
        assertThat(ok.fetched).contains("https://x/a.png")
        assertThat(ok.requests.single().avatar).isNotNull()

        val refused = Recorder()
        val job = prepare(preparer(refused, failing = setOf("a.png")), identity)
        assertThat(refused.requests.single().avatar).isNull()
        assertThat(job.branding).isNotNull()
    }

    @Test fun `un post a scene ou un reel, sans identite, rend l oeuvre seule`() = runTest {
        val recorder = Recorder()
        val job = prepare(preparer(recorder), identity = null)
        assertThat(job.branding).isNull()
        assertThat(recorder.requests).isEmpty()
        assertThat(job.overlays.first().startMillis).isEqualTo(0)
    }

    @Test fun `des cartes qui ne se peignent pas n empechent pas l export de la story`() = runTest {
        val job = prepare(preparer(Recorder(), painted = false), identity)
        assertThat(job.branding).isNull()
        assertThat(job.overlays).isNotEmpty()
    }

    @Test fun `sans peintre de marque configure, l identite remise ne change rien`() = runTest {
        assertThat(prepare(preparer(Recorder(), brand = false), identity).branding).isNull()
    }
}
