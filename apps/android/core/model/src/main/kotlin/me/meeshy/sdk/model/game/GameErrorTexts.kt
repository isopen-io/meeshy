package me.meeshy.sdk.model.game

/**
 * La phrase de chaque refus du jeu : jamais un code affiché. MIROIR de
 * `GameCopy.errorMessage(for:)` (iOS). Un code inconnu (`null`) retombe sur la
 * phrase générique.
 */
public object GameErrorTexts {

    public fun forCode(code: GameErrorCode?): GameText = GameText(
        when (code) {
            GameErrorCode.InsufficientPoints -> GameTextKey.ErrorInsufficientPoints
            GameErrorCode.InsufficientMeeshes -> GameTextKey.ErrorInsufficientMeeshes
            GameErrorCode.MintBlockedByDebt -> GameTextKey.MintBlockedDebtPlain
            GameErrorCode.TreasuryLocked -> GameTextKey.ErrorTreasuryLocked
            GameErrorCode.FreezeAtMaximum -> GameTextKey.ErrorFreezeAtMaximum
            GameErrorCode.RelightNotAllowed -> GameTextKey.ErrorRelightNotAllowed
            GameErrorCode.MissionNotFound -> GameTextKey.ErrorMissionNotFound
            GameErrorCode.MissionRerollExhausted -> GameTextKey.ErrorMissionRerollExhausted
            GameErrorCode.MissionRerollUnavailable -> GameTextKey.ErrorMissionRerollUnavailable
            GameErrorCode.MissionsLocked -> GameTextKey.ErrorMissionsLocked
            GameErrorCode.ChestNotReady -> GameTextKey.ErrorChestNotReady
            GameErrorCode.RequestIdConflict -> GameTextKey.ErrorRequestIdConflict
            GameErrorCode.LeagueLocked -> GameTextKey.ErrorLeagueLocked
            GameErrorCode.LeagueMinor -> GameTextKey.ErrorLeagueMinor
            GameErrorCode.LeagueConsentRequired -> GameTextKey.ErrorLeagueConsentRequired
            GameErrorCode.LeaguePseudonymInvalid -> GameTextKey.ErrorLeaguePseudonymInvalid
            GameErrorCode.LeaguePseudonymTaken -> GameTextKey.ErrorLeaguePseudonymTaken
            GameErrorCode.LeaguePseudonymForbidden -> GameTextKey.ErrorLeaguePseudonymForbidden
            GameErrorCode.DuoLocked -> GameTextKey.ErrorDuoLocked
            GameErrorCode.DuoNotFriends -> GameTextKey.ErrorDuoNotFriends
            GameErrorCode.DuoAlreadyActive -> GameTextKey.ErrorDuoAlreadyActive
            GameErrorCode.DuoNotFound -> GameTextKey.ErrorDuoNotFound
            GameErrorCode.DuoTransitionRefused -> GameTextKey.ErrorDuoTransitionRefused
            GameErrorCode.SeasonNotOpen -> GameTextKey.ErrorSeasonNotOpen
            GameErrorCode.SeasonStepNotFound -> GameTextKey.ErrorSeasonStepNotFound
            GameErrorCode.SeasonStepLocked -> GameTextKey.ErrorSeasonStepLocked
            GameErrorCode.SeasonStepAlreadyClaimed -> GameTextKey.ErrorSeasonStepAlreadyClaimed
            GameErrorCode.SealAlreadyOwned -> GameTextKey.ErrorSealAlreadyOwned
            GameErrorCode.PrestigeLevelTooLow -> GameTextKey.ErrorPrestigeLevelTooLow
            GameErrorCode.PrestigeAtMaximum -> GameTextKey.ErrorPrestigeAtMaximum
            GameErrorCode.PriceChanged -> GameTextKey.ErrorPriceChanged
            null -> GameTextKey.ErrorGeneric
        },
    )
}
