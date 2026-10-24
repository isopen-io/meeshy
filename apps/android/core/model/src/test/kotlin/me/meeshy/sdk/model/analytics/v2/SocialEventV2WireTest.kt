package me.meeshy.sdk.model.analytics.v2

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SocialEventV2WireTest {

    private fun encoded(e: SocialEventV2) = SocialEventV2Wire.encode(e)!!

    @Test
    fun `interaction partage`() {
        val json = encoded(event(SocialInteraction(SocialInteraction.Action.SHARE, dwellBeforeMs = -5, mutationId = "m1")))
        assertThat(json).isEqualTo(
            """{"action":"share","destination":"other","dwellBeforeMs":0,"eventId":"e1","mutationId":"m1","occurredAt":"2025-10-09T08:53:20.000Z","target":{"id":"p1","kind":"post"},"type":"interaction"}""",
        )
    }

    @Test
    fun `une destination n'accompagne que le partage`() {
        val json = encoded(event(SocialInteraction(SocialInteraction.Action.SAVE, destination = SocialInteraction.ShareDestination.STORY)))
        assertThat(json).doesNotContain("destination")
    }

    @Test
    fun `negatif quick skip`() {
        val json = encoded(event(SocialNegative.quickSkip(400)!!))
        assertThat(json).isEqualTo(
            """{"action":"quick_skip","eventId":"e1","occurredAt":"2025-10-09T08:53:20.000Z","target":{"id":"p1","kind":"post"},"type":"negative","visibleMs":400}""",
        )
    }

    @Test
    fun `lien sans URL ni cle nulle`() {
        val target = SocialTarget.link("www.example.com", parent = SocialTargetRef(SocialTargetKind.POST, "p9"))
        val json = encoded(event(SocialLinkEvent(SocialLinkEvent.Action.OUTBOUND_CLICK, "example.com"), target = target))
        assertThat(json).isEqualTo(
            """{"action":"outbound_click","domain":"example.com","eventId":"e1","occurredAt":"2025-10-09T08:53:20.000Z","target":{"id":"example.com","kind":"link","parent":{"id":"p9","kind":"post"}},"type":"link"}""",
        )
    }

    @Test
    fun `decouverte ne porte que la longueur de la requete`() {
        val payload = SocialDiscovery(SocialDiscovery.Action.SEARCH_SUBMITTED, searchId = "s1", queryLength = 7, resultCount = 12, resultKind = SocialDiscovery.ResultKind.MIXED)
        val json = encoded(event(payload, target = null, surface = "search"))
        assertThat(json).isEqualTo(
            """{"action":"search_submitted","eventId":"e1","occurredAt":"2025-10-09T08:53:20.000Z","queryLength":7,"resultCount":12,"resultKind":"mixed","searchId":"s1","surface":"search","type":"discovery"}""",
        )
    }

    @Test
    fun `story`() {
        val json = encoded(event(SocialStoryEvent(SocialStoryEvent.Action.EXIT_BEFORE_END, -1, 4, 2_000), target = SocialTarget(SocialTargetKind.STORY, "s1")))
        assertThat(json).isEqualTo(
            """{"action":"exit_before_end","elapsedMs":2000,"eventId":"e1","occurredAt":"2025-10-09T08:53:20.000Z","slideCount":4,"slideIndex":0,"target":{"id":"s1","kind":"story"},"type":"story"}""",
        )
    }

    @Test
    fun `notification`() {
        val payload = SocialNotificationEvent(SocialNotificationEvent.Action.DISPLAYED, "new_follower", SocialNotificationEvent.Channel.IN_APP, deliveryLatencyMs = 120)
        val json = encoded(event(payload, target = SocialTarget(SocialTargetKind.NOTIFICATION, "n1")))
        assertThat(json).isEqualTo(
            """{"action":"displayed","channel":"in_app","deliveryLatencyMs":120,"eventId":"e1","notificationType":"new_follower","occurredAt":"2025-10-09T08:53:20.000Z","target":{"id":"n1","kind":"notification"},"type":"notification"}""",
        )
    }

    @Test
    fun `capture d'ecran bornee a dix cibles et sans image`() {
        val targets = (1..15).map { SocialVisibleTarget(SocialTargetKind.POST, "p$it", 0.456) }
        val payload = SocialScreenCapture(SocialScreenCapture.Action.RECORDING_STOPPED, targets, recordingMs = 4_000)
        assertThat(payload.visibleTargets).hasSize(10)
        val json = encoded(event(payload, target = null))
        assertThat(json).contains(""""captureKind":"recording_or_mirroring"""")
        assertThat(json).contains(""""recordingMs":4000""")
        assertThat(json).contains(""""visibleFraction":0.46""")
    }

    @Test
    fun `une capture n'a de duree qu'a l'arret`() {
        val started = SocialScreenCapture(SocialScreenCapture.Action.RECORDING_STARTED, emptyList(), recordingMs = 9)
        assertThat(started.recordingMs).isNull()
        assertThat(SocialScreenCapture(SocialScreenCapture.Action.SCREENSHOT, emptyList()).captureKind)
            .isEqualTo(SocialScreenCapture.CaptureKind.SCREENSHOT)
    }

    @Test
    fun `defilement de listing`() {
        val json = encoded(event(scrollListing(), target = null, listing = SocialListing(listingSessionId = "ls1", rankingSource = SocialRankingSource.FOR_YOU)))
        assertThat(json).isEqualTo(
            """{"action":"listing","activeScrollMs":800,"directionChanges":2,"distancePt":1200,"durationMs":1000,"eventId":"e1","flings":1,"itemsRendered":10,"itemsViewable":6,"listing":{"listingSessionId":"ls1","rankingSource":"for_you"},"listingSessionId":"ls1","maxPosition":9,"occurredAt":"2025-10-09T08:53:20.000Z","paginations":1,"reachedEnd":false,"refreshes":0,"segment":0,"stops":2,"type":"scroll","upDistanceRatio":0.25,"velocityHistogram":[1,2,3,4]}""",
        )
    }

    @Test
    fun `defilement de contenu`() {
        val json = encoded(event(scrollContent()))
        assertThat(json).isEqualTo(
            """{"action":"content","contentKind":"carousel","durationMs":7000,"eventId":"e1","itemsTotal":5,"maxIndexReached":3,"maxScrollFraction":0.4,"occurredAt":"2025-10-09T08:53:20.000Z","readThroughFraction":0.2,"swipes":3,"target":{"id":"p1","kind":"post"},"type":"scroll"}""",
        )
    }

    @Test
    fun `visibilite`() {
        val json = encoded(event(SocialVisibility(0.666, -3, true, impressionEventId = "i1")))
        assertThat(json).isEqualTo(
            """{"action":"measured","eventId":"e1","impressionEventId":"i1","maxVisibleFraction":0.67,"occurredAt":"2025-10-09T08:53:20.000Z","target":{"id":"p1","kind":"post"},"type":"visibility","viewable":true,"visibleMs":0}""",
        )
    }

    @Test
    fun `lecture`() {
        val json = encoded(event(playback(), target = SocialTarget(SocialTargetKind.REEL, "r1")))
        assertThat(json).isEqualTo(
            """{"action":"session","avgBitrateKbps":1800,"captionsOn":false,"eventId":"e1","exitBeforeStart":false,"exitReason":"swiped","loops":0,"mediaDurationMs":30000,"mediaId":"m1","muteToggles":0,"mutedAtStart":true,"occurredAt":"2025-10-09T08:53:20.000Z","pauses":1,"playbackId":"pb1","playedMs":12000,"quartiles":3,"rebufferCount":1,"rebufferMs":300,"renditionChanges":0,"seeks":0,"startupMs":250,"target":{"id":"r1","kind":"reel"},"type":"playback"}""",
        )
    }

    @Test
    fun `le prisme voyage dans l'enveloppe`() {
        val json = encoded(event(SocialInteraction(SocialInteraction.Action.REACT), prism = SocialPrism.served("fr", "en")))
        assertThat(json).contains(""""prism":{"displayedLanguage":"fr","originalLanguage":"en","translated":true,"translationSource":"server"}""")
    }

    @Test
    fun `aucun evenement n'ecrit de cle nulle`() {
        sampleEvents().forEach { payload ->
            val json = encoded(event(payload))
            assertThat(json).doesNotContain("null")
            assertThat(json).doesNotContain("http")
        }
    }

    @Test
    fun `chaque exemple tient sous le plafond de 2 Kio`() {
        sampleEvents().forEach { assertThat(SocialEventV2Wire.encode(event(it))).isNotNull() }
    }

    @Test
    fun `un identifiant d'evenement est un UUID en minuscules`() {
        val id = SocialEventV2.newEventId()
        assertThat(id).matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
    }
}
