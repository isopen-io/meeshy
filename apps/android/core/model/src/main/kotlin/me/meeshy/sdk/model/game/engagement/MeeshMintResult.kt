package me.meeshy.sdk.model.game.engagement

import me.meeshy.sdk.model.game.MeeshMintResponse

/** Le résultat d'une frappe : la réponse tolérante de `POST /me/meesh/mint` (une matière inconnue se lit argent). */
public typealias MeeshMintResult = MeeshMintResponse

public enum class MeeshMintOutcome { MINTED, ALREADY_MINTED, INSUFFICIENT, UNKNOWN }

/** Le statut servi, classé : `minted`, `already-minted`, `insufficient…`; autre ⇒ [MeeshMintOutcome.UNKNOWN]. */
public val MeeshMintResult.outcome: MeeshMintOutcome
    get() = when {
        status == "minted" -> MeeshMintOutcome.MINTED
        status == "already-minted" -> MeeshMintOutcome.ALREADY_MINTED
        status.startsWith("insufficient") -> MeeshMintOutcome.INSUFFICIENT
        else -> MeeshMintOutcome.UNKNOWN
    }
