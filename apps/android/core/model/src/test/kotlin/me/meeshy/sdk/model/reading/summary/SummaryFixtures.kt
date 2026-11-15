package me.meeshy.sdk.model.reading.summary

import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import me.meeshy.sdk.model.PresenceState

internal val UTC: ZoneId = ZoneOffset.UTC
internal val BASE: Instant = Instant.ofEpochSecond(1_700_000_000)

internal fun jan(day: Int, hour: Int = 12, minute: Int = 0): Instant =
    ZonedDateTime.of(2026, 1, day, hour, minute, 0, 0, UTC).toInstant()

internal fun episodeMsg(id: String, sender: String, at: Instant, reply: String? = null, system: Boolean = false) =
    EpisodeInputMessage(id, sender, at, reply, system)

internal fun digestMsg(
    id: String,
    sender: String,
    offsetSeconds: Long,
    content: String = "hello",
    reply: String? = null,
    system: Boolean = false,
    language: String? = "fr",
    media: List<DigestMediaKind> = emptyList(),
    links: Int = 0,
    mentionsViewer: Boolean = false,
) = DigestInputMessage(
    base = episodeMsg(id, sender, BASE.plusSeconds(offsetSeconds), reply, system),
    content = content, languageCode = language, attachmentKinds = media,
    linkCount = links, mentionsViewer = mentionsViewer,
)

internal fun participant(id: String, name: String = "Name", presence: PresenceState = PresenceState.OFFLINE) =
    DigestParticipant(id, name, null, "#31B6BA", presence)

internal fun source(
    id: String,
    sender: String,
    at: Instant,
    content: String = "hello",
    reply: String? = null,
    system: Boolean = false,
    protected: Boolean = false,
    username: String? = null,
    name: String? = null,
    media: List<DigestMediaKind> = emptyList(),
) = SummarySourceMessage(
    id = id, senderId = sender, senderName = name, senderUsername = username, senderColorHex = null,
    senderAvatarUrl = null, createdAt = at, replyToId = reply, isSystem = system, content = content,
    originalLanguage = "fr", attachmentKinds = media, linkCount = 0, isProtected = protected,
)
