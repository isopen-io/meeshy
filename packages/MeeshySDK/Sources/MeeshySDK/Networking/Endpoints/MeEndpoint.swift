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
    case export
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
        case .export: return "/api/v1/me/export"
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
        }
    }
}
