// GÉNÉRÉ — ne pas éditer à la main.
//
// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le
// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après
// tout changement de route :
//
//   cd packages/shared && npm run ios-endpoints:generate
//
// Les politiques d'authentification et de réessai ne sont PAS ici : ce sont des
// décisions client, écrites à la main en redéfinition de `MeeshyEndpoint`.

import Foundation

public enum MeEndpoint: MeeshyEndpoint, Sendable {
    case accountDeletion
    case categories
    case categoriesByCategoryId(categoryId: String)
    case categoriesReorder
    case consents
    case consentsByPurpose(purpose: String)
    case deleteAccount
    case deleteAccountCancel
    case deleteAccountConfirm
    case deleteAccountDeleteNow
    case engagement
    case export
    case gameChestClaim
    case gameDuoByDuoIdAbandon(duoId: String)
    case gameDuoByDuoIdAccept(duoId: String)
    case gameDuoInvite
    case gameFlameFreezes
    case gameFlameRelight
    case gameGuideSeen
    case gameLeagueConsent
    case gameLeagueFriends
    case gameLeaguePseudonym
    case gameLeagueWeek
    case gameMissionsByMissionIdReroll(missionId: String)
    case gamePrestige
    case gamePrivacy
    case gameSeasonSeal
    case gameSeasonStepsByStepClaim(step: String)
    case gameShowcaseOrder
    case gameVisibility
    case meeshMint
    case onboarding
    case permissions
    case preferences
    case preferencesApplication
    case preferencesAudio
    case preferencesCategories
    case preferencesCategoriesByCategoryId(categoryId: String)
    case preferencesCategoriesReorder
    case preferencesDocument
    case preferencesEncryption
    case preferencesMessage
    case preferencesNotification
    case preferencesPrivacy
    case preferencesVideo
    case root
    case starredMessages
    case starredMessagesByMessageId(messageId: String)
    case stickers
    case stickersByStickerId(stickerId: String)
    case stickersByStickerIdUse(stickerId: String)
    case terms

    public var path: String {
        switch self {
        case .accountDeletion: return "/api/v1/me/account/deletion"
        case .categories: return "/api/v1/me/categories"
        case .categoriesByCategoryId(let categoryId): return "/api/v1/me/categories/\(categoryId)"
        case .categoriesReorder: return "/api/v1/me/categories/reorder"
        case .consents: return "/api/v1/me/consents"
        case .consentsByPurpose(let purpose): return "/api/v1/me/consents/\(purpose)"
        case .deleteAccount: return "/api/v1/me/delete-account"
        case .deleteAccountCancel: return "/api/v1/me/delete-account/cancel"
        case .deleteAccountConfirm: return "/api/v1/me/delete-account/confirm"
        case .deleteAccountDeleteNow: return "/api/v1/me/delete-account/delete-now"
        case .engagement: return "/api/v1/me/engagement"
        case .export: return "/api/v1/me/export"
        case .gameChestClaim: return "/api/v1/me/game/chest/claim"
        case .gameDuoByDuoIdAbandon(let duoId): return "/api/v1/me/game/duo/\(duoId)/abandon"
        case .gameDuoByDuoIdAccept(let duoId): return "/api/v1/me/game/duo/\(duoId)/accept"
        case .gameDuoInvite: return "/api/v1/me/game/duo/invite"
        case .gameFlameFreezes: return "/api/v1/me/game/flame/freezes"
        case .gameFlameRelight: return "/api/v1/me/game/flame/relight"
        case .gameGuideSeen: return "/api/v1/me/game/guide/seen"
        case .gameLeagueConsent: return "/api/v1/me/game/league/consent"
        case .gameLeagueFriends: return "/api/v1/me/game/league/friends"
        case .gameLeaguePseudonym: return "/api/v1/me/game/league/pseudonym"
        case .gameLeagueWeek: return "/api/v1/me/game/league/week"
        case .gameMissionsByMissionIdReroll(let missionId): return "/api/v1/me/game/missions/\(missionId)/reroll"
        case .gamePrestige: return "/api/v1/me/game/prestige"
        case .gamePrivacy: return "/api/v1/me/game/privacy"
        case .gameSeasonSeal: return "/api/v1/me/game/season/seal"
        case .gameSeasonStepsByStepClaim(let step): return "/api/v1/me/game/season/steps/\(step)/claim"
        case .gameShowcaseOrder: return "/api/v1/me/game/showcase/order"
        case .gameVisibility: return "/api/v1/me/game/visibility"
        case .meeshMint: return "/api/v1/me/meesh/mint"
        case .onboarding: return "/api/v1/me/onboarding"
        case .permissions: return "/api/v1/me/permissions"
        case .preferences: return "/api/v1/me/preferences"
        case .preferencesApplication: return "/api/v1/me/preferences/application"
        case .preferencesAudio: return "/api/v1/me/preferences/audio"
        case .preferencesCategories: return "/api/v1/me/preferences/categories"
        case .preferencesCategoriesByCategoryId(let categoryId): return "/api/v1/me/preferences/categories/\(categoryId)"
        case .preferencesCategoriesReorder: return "/api/v1/me/preferences/categories/reorder"
        case .preferencesDocument: return "/api/v1/me/preferences/document"
        case .preferencesEncryption: return "/api/v1/me/preferences/encryption"
        case .preferencesMessage: return "/api/v1/me/preferences/message"
        case .preferencesNotification: return "/api/v1/me/preferences/notification"
        case .preferencesPrivacy: return "/api/v1/me/preferences/privacy"
        case .preferencesVideo: return "/api/v1/me/preferences/video"
        case .root: return "/api/v1/me"
        case .starredMessages: return "/api/v1/me/starred-messages"
        case .starredMessagesByMessageId(let messageId): return "/api/v1/me/starred-messages/\(messageId)"
        case .stickers: return "/api/v1/me/stickers"
        case .stickersByStickerId(let stickerId): return "/api/v1/me/stickers/\(stickerId)"
        case .stickersByStickerIdUse(let stickerId): return "/api/v1/me/stickers/\(stickerId)/use"
        case .terms: return "/api/v1/me/terms"
        }
    }
}
