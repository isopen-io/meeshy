import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les trois strates des Réglages** (#18589). En haut ce qui se touche
/// souvent dans la vie de Meeshy, sous un seul pli ce qu'on ouvre une fois par
/// an, en pied la session et la suppression du compte. L'ordre des cas est
/// l'ordre de l'écran.
enum SettingsStratum: Int, CaseIterable, Comparable {
    case life, annex, footer

    static func < (lhs: SettingsStratum, rhs: SettingsStratum) -> Bool { lhs.rawValue < rhs.rawValue }
}

/// **Une rangée des Réglages.** Chaque cas a UNE place dans `SettingsLayout`
/// et UN effet (`presentation`) : un cas sans place ou sans effet serait un
/// contrôle qui existe sans servir.
enum SettingsDestination: String, CaseIterable, Hashable {
    case privacy, security, blockedUsers
    case notifications
    case theme, interfaceLanguage, shop
    case voiceProfile
    case transcriptionMine, transcriptionAuto
    case mediaDownload
    case lentilleList, readingModes, riviereMode
    case storage, exportData
    case helpCenter
    case about, terms, privacyPolicy, licenses
    case switchAccount, logout
    case deleteAccount

    var presentation: SettingsPresentation {
        switch self {
        case .privacy: return .sheet(.privacy)
        case .security: return .sheet(.security)
        case .blockedUsers: return .sheet(.blockedUsers)
        case .notifications: return .sheet(.notifications)
        case .mediaDownload: return .sheet(.mediaDownload)
        case .storage: return .sheet(.storage)
        case .exportData: return .sheet(.dataExport)
        case .helpCenter: return .sheet(.support)
        case .about: return .sheet(.about)
        case .terms: return .sheet(.terms)
        case .privacyPolicy: return .sheet(.privacyPolicy)
        case .licenses: return .sheet(.licenses)
        case .switchAccount: return .sheet(.accountSwitcher)
        case .deleteAccount: return .sheet(.deleteAccount)
        case .voiceProfile: return .voiceSetup
        case .shop: return .shop
        case .logout: return .logoutConfirmation
        case .theme, .interfaceLanguage, .transcriptionMine, .transcriptionAuto,
             .lentilleList, .readingModes, .riviereMode:
            return .control
        }
    }
}

/// Les feuilles que les Réglages présentent, portées par UN état : deux
/// rangées ne peuvent pas ouvrir deux feuilles à la fois.
enum SettingsSheet: Hashable, Identifiable {
    case privacy, security, blockedUsers, notifications
    case voiceProfileManage(opensWizardWhenEmpty: Bool), voiceProfileWizard
    case mediaDownload, storage, dataExport, support
    case about, terms, privacyPolicy, licenses
    case accountSwitcher, deleteAccount

    var id: Self { self }
}

/// Ce que produit le toucher d'une rangée.
enum SettingsPresentation: Equatable {
    case sheet(SettingsSheet)
    /// La feuille de la voix dépend du consentement : `SettingsRowContent.voiceProfile`.
    case voiceSetup
    /// La Boutique passe par `PackShopLauncher`, la même porte que ses liens profonds.
    case shop
    /// Interrupteur ou menu posé dans la rangée.
    case control
    case logoutConfirmation
}

/// L'identité d'un bloc : son ancre de défilement, son titre, son icône et sa
/// teinte. Les blocs du pied n'ont pas de titre : ce sont des boutons seuls.
enum SettingsBlockID: String, Hashable {
    case account, notifications, appearance, voice, transcription, media
    case interfaceFeatures, dataStorage, help, about
    case session, deleteAccount

    var anchor: String { "settings.section.\(rawValue)" }

    var title: String? {
        switch self {
        case .account: return String(localized: "settings.section.account", bundle: .main)
        case .notifications: return String(localized: "settings.section.notifications", bundle: .main)
        case .appearance: return String(localized: "settings.section.appearance", bundle: .main)
        case .voice: return String(localized: "settings.section.voice", bundle: .main)
        case .transcription: return String(localized: "settings.section.transcription", bundle: .main)
        case .media: return String(localized: "settings.section.media", defaultValue: "Médias", bundle: .main)
        case .interfaceFeatures:
            return String(localized: "settings.section.interface_features", defaultValue: "Fonctions de l'interface", bundle: .main)
        case .dataStorage: return String(localized: "settings.section.data_storage", defaultValue: "Données et stockage", bundle: .main)
        case .help: return String(localized: "settings.section.help", bundle: .main)
        case .about: return String(localized: "settings.section.about", bundle: .main)
        case .session, .deleteAccount: return nil
        }
    }

    var icon: String {
        switch self {
        case .account: return "person.circle.fill"
        case .notifications: return "bell.fill"
        case .appearance: return "paintbrush.fill"
        case .voice: return "waveform.and.mic"
        case .transcription: return "text.quote"
        case .media: return "photo.on.rectangle.angled"
        case .interfaceFeatures: return "switch.2"
        case .dataStorage: return "externaldrive.fill"
        case .help: return "questionmark.circle.fill"
        case .about: return "info.circle.fill"
        case .session: return "person.2.arrow.trianglehead.counterclockwise"
        case .deleteAccount: return "person.crop.circle.badge.minus"
        }
    }

    var color: String {
        switch self {
        case .account, .voice: return MeeshyColors.trackingAccentHex
        case .notifications, .deleteAccount: return MeeshyColors.errorHex
        case .appearance, .media, .dataStorage: return MeeshyColors.warningHex
        case .transcription: return MeeshyColors.indigo300Hex
        case .interfaceFeatures: return MeeshyColors.indigo400Hex
        case .help: return MeeshyColors.successHex
        case .about: return MeeshyColors.infoHex
        case .session: return MeeshyColors.brandPrimaryHex
        }
    }

    /// La phrase d'orientation lisible sous le titre (règle 7 de l'épure).
    var sentence: String? {
        switch self {
        case .voice: return SettingsOrientation.voice
        case .transcription: return SettingsOrientation.transcription
        default: return nil
        }
    }
}

struct SettingsBlock: Identifiable, Equatable {
    let id: SettingsBlockID
    let stratum: SettingsStratum
    let destinations: [SettingsDestination]
}

/// **La loi des Réglages** : les blocs dans l'ordre de l'écran. Une
/// information vit à UN endroit — les statistiques, Ma Légende, les favoris,
/// les publications enregistrées et le parrainage vivent au Profil ; Sons et
/// Vibrations, dans la feuille Notifications ; la version, dans À propos.
enum SettingsLayout {
    static let blocks: [SettingsBlock] = [
        SettingsBlock(id: .account, stratum: .life, destinations: [.privacy, .security, .blockedUsers]),
        SettingsBlock(id: .notifications, stratum: .life, destinations: [.notifications]),
        SettingsBlock(id: .appearance, stratum: .life, destinations: [.theme, .interfaceLanguage, .shop]),
        SettingsBlock(id: .voice, stratum: .life, destinations: [.voiceProfile]),
        SettingsBlock(id: .transcription, stratum: .life, destinations: [.transcriptionMine, .transcriptionAuto]),
        SettingsBlock(id: .media, stratum: .life, destinations: [.mediaDownload]),
        SettingsBlock(id: .interfaceFeatures, stratum: .annex, destinations: [.lentilleList, .readingModes, .riviereMode]),
        SettingsBlock(id: .dataStorage, stratum: .annex, destinations: [.storage, .exportData]),
        SettingsBlock(id: .help, stratum: .annex, destinations: [.helpCenter]),
        SettingsBlock(id: .about, stratum: .annex, destinations: [.about, .terms, .privacyPolicy, .licenses]),
        SettingsBlock(id: .session, stratum: .footer, destinations: [.switchAccount, .logout]),
        SettingsBlock(id: .deleteAccount, stratum: .footer, destinations: [.deleteAccount]),
    ]

    static func blocks(in stratum: SettingsStratum) -> [SettingsBlock] {
        blocks.filter { $0.stratum == stratum }
    }

    static func block(containing destination: SettingsDestination) -> SettingsBlock? {
        blocks.first { $0.destinations.contains(destination) }
    }

    /// Atteindre une rangée d'annexe exige d'abord de déplier le pli : sans
    /// cela, le défilement viserait une ancre qui n'est pas montée.
    static func unfoldsAnnex(toReach destination: SettingsDestination) -> Bool {
        block(containing: destination)?.stratum == .annex
    }

    /// L'état du pli après qu'un réglage a été désigné : il se déplie pour une
    /// annexe et ne se replie jamais de lui-même.
    static func annexUnfolded(current: Bool, reaching destination: SettingsDestination) -> Bool {
        current || unfoldsAnnex(toReach: destination)
    }

    /// Ce que le pli replié contient, lisible sans le déplier.
    static var annexSummary: String {
        blocks(in: .annex).compactMap(\.id.title).joined(separator: " · ")
    }
}
