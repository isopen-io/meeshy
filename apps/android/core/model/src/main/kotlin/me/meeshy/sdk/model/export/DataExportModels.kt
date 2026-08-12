package me.meeshy.sdk.model.export

import kotlinx.serialization.Serializable

/**
 * The parsed payload of `GET /api/v1/me/export` (GDPR data portability, feature-parity §L) — the
 * Android port of the iOS `DataExportData` model (DataExportService.swift), corrected to carry the
 * **full** exported payload rather than iOS's summary-only wrapper.
 *
 * The gateway (`routes/me/export.ts`) returns `{ exportDate, format, requestedTypes, profile?,
 * messages?, messagesCount?, contacts?, contactsCount?, csv? }`. Every section is optional — only
 * the requested [requestedTypes] are populated — so every field here is nullable and unknown keys
 * are ignored by the SDK [me.meeshy.sdk.net.MeeshyApi.json].
 *
 * Timestamps stay as raw ISO-8601 [String]s (the gateway emits `new Date().toISOString()`); keeping
 * them as strings lets the whole payload round-trip losslessly back to a JSON export file without an
 * `Instant` serializer, and faithfully preserves what the server sent.
 */
@Serializable
public data class DataExportData(
    val exportDate: String = "",
    val format: String = "json",
    val requestedTypes: List<String> = emptyList(),
    val profile: ExportedProfile? = null,
    val messages: List<ExportedMessage>? = null,
    val messagesCount: Int? = null,
    val contacts: List<ExportedContact>? = null,
    val contactsCount: Int? = null,
    val csv: Map<String, String>? = null,
)

/** The `profile` section — the signed-in user's identity fields (see gateway `select`). */
@Serializable
public data class ExportedProfile(
    val id: String? = null,
    val username: String? = null,
    val displayName: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val email: String? = null,
    val phoneNumber: String? = null,
    val bio: String? = null,
    val avatar: String? = null,
    val banner: String? = null,
    val systemLanguage: String? = null,
    val regionalLanguage: String? = null,
    val customDestinationLanguage: String? = null,
    val timezone: String? = null,
    val createdAt: String? = null,
    val lastActiveAt: String? = null,
)

/** One row of the `messages` section — a message the user authored. */
@Serializable
public data class ExportedMessage(
    val id: String? = null,
    val conversationId: String? = null,
    val content: String? = null,
    val originalLanguage: String? = null,
    val messageType: String? = null,
    val messageSource: String? = null,
    val createdAt: String? = null,
    val editedAt: String? = null,
)

/** A co-participant of one of the user's conversations, in the `contacts` section. */
@Serializable
public data class ExportedContactParticipant(
    val displayName: String? = null,
    val type: String? = null,
)

/** One row of the `contacts` section — a conversation the user participates in. */
@Serializable
public data class ExportedContact(
    val conversationId: String? = null,
    val conversationName: String? = null,
    val conversationType: String? = null,
    val role: String? = null,
    val joinedAt: String? = null,
    val participants: List<ExportedContactParticipant> = emptyList(),
)
