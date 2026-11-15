package me.meeshy.sdk.model.relation

import kotlinx.serialization.Serializable

/**
 * L'écoute d'un Proche ou d'un Sang, telle que la passerelle la SERT à ce lecteur (#13934, #16686) — le contrat de
 * `packages/shared/types/now-playing.ts`. La troncature est faite par le serveur : un Proche ne reçoit que [category],
 * [title] et [source] n'existent que pour un Sang à qui ils ont été partagés. Le client ne recalcule rien.
 *
 * [category] reste la chaîne brute (`music`, `video`, `browsing`) : une catégorie ajoutée au serveur n'est pas fatale.
 */
@Serializable
public data class NowPlayingWire(
    val userId: String,
    val category: String,
    val title: String? = null,
    val source: String? = null,
    val updatedAt: String,
    val expiresAt: String,
)

/** `GET /relations/now-playing` : les écoutes en cours de mes liens, déjà tronquées. */
@Serializable
public data class NowPlayingSnapshotWire(val items: List<NowPlayingWire> = emptyList())
