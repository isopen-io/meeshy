package me.meeshy.sdk.model.analytics

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Test

class SocialEventWireTest {

    private val networkJson = Json { encodeDefaults = false; ignoreUnknownKeys = true; explicitNulls = true }
    private val stamp = SocialEventStamp("3f2504e0-4f89-41d3-9a0c-0305e82c3301", 1_757_928_863_563L)

    private fun encode(event: SocialEvent, s: SocialEventStamp = stamp): String =
        networkJson.encodeToString(StampedSocialEvent.serializer(), StampedSocialEvent(event, s))

    private fun session() = EngagementSession(
        sessionId = "sess", userId = "u1", postId = "p1", contentType = EngagementSession.ContentType.REEL,
        surface = EngagementSession.Surface.reels, startedAt = 1_757_928_860_000L, dwellMs = 3_000,
        consent = "granted",
    )

    @Test
    fun `view minimal ecrit son discriminant et l'enveloppe a plat sans cle null`() {
        assertThat(encode(SocialEvent.View("p1"))).isEqualTo(
            """{"type":"view","postId":"p1","eventId":"3f2504e0-4f89-41d3-9a0c-0305e82c3301","occurredAt":"2025-09-15T09:34:23.563Z"}""",
        )
    }

    @Test
    fun `view complet porte duree surface et entree listing avec son origine`() {
        val json = encode(SocialEvent.View("p1", 1200, ContentSurface.DETAIL, ContentEntry.listing(OpenOrigin.STORY_RAIL)))
        assertThat(json).contains(""""durationMs":1200""")
        assertThat(json).contains(""""surface":"detail"""")
        assertThat(json).contains(""""provenance":"listing","origin":"story_rail"""")
    }

    @Test
    fun `view d'une provenance non listing ne porte aucune origine`() {
        val json = encode(SocialEvent.View("p1", entry = ContentEntry.sharedLink))
        assertThat(json).contains(""""provenance":"shared_link"""")
        assertThat(json).doesNotContain("origin")
        assertThat(ContentEntry.of(ViewProvenance.DIRECT, OpenOrigin.FEED).origin).isNull()
    }

    @Test
    fun `impression sans listing`() {
        val json = encode(SocialEvent.Impression("p1", "feed"))
        assertThat(json).startsWith("""{"type":"impression","postId":"p1","source":"feed","eventId"""")
        assertThat(json).doesNotContain("null")
    }

    @Test
    fun `impression avec listing et visibilite`() {
        val json = encode(
            SocialEvent.Impression(
                "p1", "feed", ContentSurface.FEED,
                SocialListing(feedRequestId = "r1", position = 3, rankingSource = SocialRankingSource.FOR_YOU),
                SocialVisibility.of(0.456, 1500, true),
            ),
        )
        assertThat(json).contains(""""listing":{"feedRequestId":"r1","position":3,"rankingSource":"for_you"}""")
        assertThat(json).contains(""""visibility":{"maxVisibleFraction":0.46,"visibleMs":1500,"viewable":true}""")
        assertThat(json).doesNotContain("null")
    }

    @Test
    fun `open sans origine reste un open`() {
        val json = encode(SocialEvent.Open("p1", null))
        assertThat(json).startsWith("""{"type":"open","postId":"p1","eventId"""")
        assertThat(encode(SocialEvent.Open("p1", OpenOrigin.SEARCH))).contains(""""origin":"search"""")
    }

    @Test
    fun `dwell et dwell-start aplatissent la session avec leur discriminant`() {
        val dwell = Json.parseToJsonElement(encode(SocialEvent.Dwell(session()))).jsonObject
        assertThat(dwell["type"].toString()).isEqualTo("\"dwell\"")
        assertThat(dwell["startedAt"].toString()).isEqualTo("\"2025-09-15T09:34:20.000Z\"")
        assertThat(dwell["contentType"].toString()).isEqualTo("\"REEL\"")
        assertThat(dwell.containsKey("watchMs")).isFalse()
        val start = Json.parseToJsonElement(encode(SocialEvent.DwellStart(session()))).jsonObject
        assertThat(start["type"].toString()).isEqualTo("\"dwell-start\"")
    }

    @Test
    fun `un aller-retour conserve evenement et enveloppe`() {
        listOf(
            SocialEvent.View("p", 5, ContentSurface.REELS, ContentEntry.listing(OpenOrigin.FEED)),
            SocialEvent.Impression("p", "feed", ContentSurface.FEED, SocialListing(position = 1), SocialVisibility.of(1.0, 1, true, "i")),
            SocialEvent.Open("p", OpenOrigin.HASHTAG),
            SocialEvent.Dwell(session()),
            SocialEvent.DwellStart(session()),
        ).forEach { event ->
            val stamped = StampedSocialEvent.stamping(event, 42L)
            val json = networkJson.encodeToString(StampedSocialEvent.serializer(), stamped)
            assertThat(networkJson.decodeFromString(StampedSocialEvent.serializer(), json)).isEqualTo(stamped)
        }
    }

    @Test
    fun `une valeur inconnue se lit comme absente sans faire echouer l'evenement`() {
        val read = SocialEventWire.decode(
            Json.parseToJsonElement(
                """{"type":"view","postId":"p","surface":"hologram","provenance":"warp","origin":"x","eventId":"e1"}""",
            ).jsonObject,
        )
        assertThat(read.event).isEqualTo(SocialEvent.View("p"))
        assertThat(read.stamp).isEqualTo(SocialEventStamp("e1", null))
    }

    @Test
    fun `un ancien format sans enveloppe genere eventId et garde l'identite d'une session`() {
        val legacy = Json.parseToJsonElement("""{"type":"open","postId":"p"}""").jsonObject
        val a = SocialEventWire.decode(legacy)
        val b = SocialEventWire.decode(legacy)
        assertThat(a.event).isEqualTo(SocialEvent.Open("p", null))
        assertThat(a.stamp.eventId).isNotEqualTo(b.stamp.eventId)
        assertThat(a.stamp.occurredAtMs).isNull()

        val dwellJson = networkJson.encodeToString(StampedSocialEvent.serializer(), StampedSocialEvent.stamping(SocialEvent.Dwell(session()), 0))
        val bare = JsonObject(Json.parseToJsonElement(dwellJson).jsonObject - "eventId" - "occurredAt")
        assertThat(SocialEventWire.decode(bare).stamp).isEqualTo(SocialEventStamp.of(session()))
    }
}
