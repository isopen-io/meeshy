package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * One viewer of a story, as the viewers sheet renders it — port of iOS
 * `StoryViewerSnapshot` (StoryInteractionService.swift). A pure domain value: the
 * sheet shows the [displayName], optional [avatarUrl], the [viewedAt] timestamp
 * (ISO-8601 string, `null` when the gateway omits it) and an optional
 * [reactionEmoji] when the viewer reacted.
 */
data class StoryViewer(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String?,
    val viewedAt: String?,
    val reactionEmoji: String?,
)

/**
 * Wire shape returned by `GET /posts/{id}/interactions` — port of iOS
 * `StoryViewersWireResponse`. Every field but the id is nullable/defaulted so a
 * sparse gateway payload never fails decoding.
 */
@Serializable
data class StoryViewersResponse(
    val viewers: List<StoryViewerWire> = emptyList(),
)

@Serializable
data class StoryViewerWire(
    val id: String,
    val username: String = "",
    val displayName: String? = null,
    val avatarUrl: String? = null,
    val viewedAt: String? = null,
    val reaction: String? = null,
)

/**
 * Maps a wire viewer to its domain value. The display name falls back to the
 * username when absent OR blank (iOS only checks for nil; we also guard blank so
 * a whitespace name from the gateway never renders an empty row), and a blank
 * reaction collapses to `null` so the sheet shows no reaction badge.
 */
fun StoryViewerWire.toStoryViewer(): StoryViewer = StoryViewer(
    id = id,
    username = username,
    displayName = displayName?.takeIf { it.isNotBlank() } ?: username,
    avatarUrl = avatarUrl?.takeIf { it.isNotBlank() },
    viewedAt = viewedAt?.takeIf { it.isNotBlank() },
    reactionEmoji = reaction?.takeIf { it.isNotBlank() },
)

/**
 * Ce que la liste des vues d'une story rend, à TROIS issues — port de iOS `ViewerListOutcome`
 * (`StoryInteractionService.loadViewerList`). Le refus (403 : la liste n'est pas pour ce lecteur)
 * se distingue de la panne, pour que la feuille le DISE au lieu de se montrer vide comme si
 * personne n'avait rien vu.
 */
sealed interface StoryViewersOutcome {
    data class Loaded(val viewers: List<StoryViewer>) : StoryViewersOutcome
    data object Forbidden : StoryViewersOutcome
    data object Failed : StoryViewersOutcome

    companion object {
        const val FORBIDDEN_STATUS: Int = 403

        /** Classe un statut HTTP de refus : 403 est le seul refus qui a sa propre issue. */
        fun failure(httpStatus: Int?): StoryViewersOutcome =
            if (httpStatus == FORBIDDEN_STATUS) Forbidden else Failed
    }
}
