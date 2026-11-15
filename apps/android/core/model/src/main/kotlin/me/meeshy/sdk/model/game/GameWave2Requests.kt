package me.meeshy.sdk.model.game

import kotlinx.serialization.Serializable

/*
 * Les corps des écritures de la vague 2. MIROIR de `GameWave2Models.swift` (iOS)
 * et de `packages/shared/types/game-v2.ts`.
 *
 * Toutes portent un `requestId` (8 à 64 caractères), généré UNE fois par
 * INTENTION : rejouer une écriture rend son résultat, jamais une seconde écriture.
 * Tout champ optionnel absent n'est pas envoyé (`encodeDefaults = false`).
 */

@Serializable
public data class LeagueConsentRequest(
    val requestId: String,
    val consent: Boolean,
    /** Choisi au consentement, sinon le pseudonyme par défaut s'applique. */
    val pseudonym: String? = null,
)

@Serializable
public data class LeaguePseudonymRequest(val requestId: String, val pseudonym: String)

@Serializable
public data class DuoInviteRequest(val requestId: String, val friendId: String)

@Serializable
public data class ShowcaseOrderRequest(
    val requestId: String,
    /** 200 clés au plus. */
    val order: List<String>,
)

/** Au moins un des quatre réglages. */
@Serializable
public data class ShowcaseVisibilityRequest(
    val requestId: String,
    val showcase: ShowcaseVisibility? = null,
    val rank: ShowcaseVisibility? = null,
    val treasury: ShowcaseVisibility? = null,
    val atlas: ShowcaseVisibility? = null,
)

/** « Jeu masqué » et l'opposition à la ligue Amis : deux interrupteurs, au moins un. */
@Serializable
public data class GamePrivacyRequest(
    val requestId: String,
    val gameHidden: Boolean? = null,
    val friendsLeagueOptOut: Boolean? = null,
)
