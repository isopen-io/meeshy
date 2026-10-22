package me.meeshy.sdk.model.game

/**
 * Codes d'erreur des écritures du jeu (champ `code` d'un refus 409). La requête
 * est bien formée, c'est l'ÉTAT du compte qui la refuse. MIROIR de
 * `GAME_ERROR_CODES` (`packages/shared/types/game-routes.ts`) et de
 * `GameErrorCode` (iOS) : le TypeScript fait foi.
 *
 * Un code inconnu (ajouté par un serveur plus récent) se lit `null` via
 * [fromWire] : il ne lève jamais.
 */
public enum class GameErrorCode(public val wire: String) {
    InsufficientPoints("INSUFFICIENT_POINTS"),
    InsufficientMeeshes("INSUFFICIENT_MEESHES"),

    /** La pièce ferait entrer dans une réserve que le rang n'ouvre pas encore (#10848). */
    TreasuryLocked("TREASURY_LOCKED"),

    /** Frappe refusée tant qu'une dette d'étincelles existe — le refus porte `sparksDebt` à la racine. */
    MintBlockedByDebt("MINT_BLOCKED_BY_DEBT"),

    /** Le prix rejugé dépasse la garde `maxPrice` (#10903) — le refus porte le prix courant à la racine. */
    PriceChanged("PRICE_CHANGED"),
    FreezeAtMaximum("FREEZE_AT_MAXIMUM"),
    RelightNotAllowed("RELIGHT_NOT_ALLOWED"),
    MissionNotFound("MISSION_NOT_FOUND"),
    MissionRerollExhausted("MISSION_REROLL_EXHAUSTED"),
    MissionRerollUnavailable("MISSION_REROLL_UNAVAILABLE"),
    MissionsLocked("MISSIONS_LOCKED"),
    ChestNotReady("CHEST_NOT_READY"),

    /** Le `requestId` a déjà servi à une AUTRE écriture : il faut un identifiant neuf. */
    RequestIdConflict("REQUEST_ID_CONFLICT"),

    LeagueLocked("LEAGUE_LOCKED"),
    LeagueMinor("LEAGUE_MINOR"),
    LeagueConsentRequired("LEAGUE_CONSENT_REQUIRED"),
    LeaguePseudonymInvalid("LEAGUE_PSEUDONYM_INVALID"),
    LeaguePseudonymTaken("LEAGUE_PSEUDONYM_TAKEN"),
    LeaguePseudonymForbidden("LEAGUE_PSEUDONYM_FORBIDDEN"),
    DuoLocked("DUO_LOCKED"),
    DuoNotFriends("DUO_NOT_FRIENDS"),
    DuoAlreadyActive("DUO_ALREADY_ACTIVE"),
    DuoNotFound("DUO_NOT_FOUND"),
    DuoTransitionRefused("DUO_TRANSITION_REFUSED"),
    SeasonNotOpen("SEASON_NOT_OPEN"),
    SeasonStepNotFound("SEASON_STEP_NOT_FOUND"),
    SeasonStepLocked("SEASON_STEP_LOCKED"),
    SeasonStepAlreadyClaimed("SEASON_STEP_ALREADY_CLAIMED"),
    SealAlreadyOwned("SEAL_ALREADY_OWNED"),
    PrestigeLevelTooLow("PRESTIGE_LEVEL_TOO_LOW"),
    PrestigeAtMaximum("PRESTIGE_AT_MAXIMUM"),
    ;

    public companion object {
        /** Le code du champ `code` d'un refus, ou `null` pour tout ce que ce client ne connaît pas. */
        public fun fromWire(raw: String?): GameErrorCode? = entries.firstOrNull { it.wire == raw }
    }
}
