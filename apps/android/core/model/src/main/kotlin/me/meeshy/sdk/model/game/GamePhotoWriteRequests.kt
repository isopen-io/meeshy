package me.meeshy.sdk.model.game

import kotlinx.serialization.Serializable

/*
 * Les corps des écritures des cadres et des moments photo (`GAME_PHOTO_ROUTES`, packages/shared/types/game-photo.ts).
 * Chacune porte un `requestId` né UNE fois par intention.
 */

/** `PUT /me/game/frames/atmosphere` : choisir son atmosphère de cadres, qui INSTALLE aussi son pack. */
@Serializable
public data class FrameAtmosphereRequest(val requestId: String, val atmosphere: String)

/** `PUT /me/game/photo-moments/invitations` : `every`, `major` ou `never`. */
@Serializable
public data class PhotoInvitationsRequest(val requestId: String, val invitations: String)

/** `POST /me/game/photo-moments/presented` et `/kept` : des identifiants d'étape, 64 au plus, rien d'autre. */
@Serializable
public data class PhotoMomentsRequest(val requestId: String, val stepIds: List<String>)
