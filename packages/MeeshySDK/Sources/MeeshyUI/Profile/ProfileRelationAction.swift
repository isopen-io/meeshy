import Foundation
import MeeshySDK

// MARK: - Les opérations de la fiche d'un autre (#18870)
//
// La face Actions range TOUTES les opérations existantes, chacune offerte ou verrouillée selon le cercle commun
// (le plus bas des deux niveaux accordés, loi 3). Le cercle qui ouvre un outil est celui de la loi d'accès
// (`RelationFeature.minimumLevel`) : aucun seuil n'est réécrit ici. La passerelle rejuge à chaque appui ; ce catalogue
// ne sert qu'à ne pas proposer ce qu'elle refusera, et à dire ce qui manque (loi 4).

/// Une opération sur la fiche d'un autre. L'ordre des cas est celui de la planche `Autre-Actions`.
public nonisolated enum ProfileRelationAction: String, CaseIterable, Sendable {
    case write, call, video, talkie, together, bring, location, battery, unreachable, sendProfile, block, report

    /// La feature de la loi d'accès qui garde l'opération ; `nil` : ouverte à tous (envoyer le profil, bloquer, signaler).
    public var feature: RelationFeature? {
        switch self {
        case .write: return .dmRequest
        case .call, .video: return .callRing
        case .talkie: return .talkie
        case .together: return .together
        case .bring: return .bring
        case .location: return .locationTemporary
        case .battery: return .deviceBattery
        case .unreachable: return .deviceUnreachable
        case .sendProfile, .block, .report: return nil
        }
    }

    /// Offerte au cercle commun `level`, ou verrouillée avec le cercle qui l'ouvre.
    public func gate(at level: RelationLevel) -> ProfileRelationGate {
        guard let minimum = feature?.minimumLevel, level < minimum else { return .offered }
        return .locked(opensAt: minimum)
    }

    /// Sous Connaissance, écrire part en DEMANDE de message (`dm.request`) : le premier message arrive dans ses demandes.
    public static func writesARequest(at level: RelationLevel) -> Bool {
        level < RelationFeature.dmDirect.minimumLevel
    }

    /// Ce qui est fermé au cercle `level`, groupé par cercle qui l'ouvre, du plus proche au plus lointain.
    public static func lockedGroups(at level: RelationLevel) -> [ProfileRelationLockedGroup] {
        let locked: [(RelationLevel, ProfileRelationAction)] = allCases.compactMap { action in
            guard case .locked(let opensAt) = action.gate(at: level) else { return nil }
            return (opensAt, action)
        }
        return RelationLevel.allCases.compactMap { opening in
            let actions = locked.filter { $0.0 == opening }.map { $0.1 }
            return actions.isEmpty ? nil : ProfileRelationLockedGroup(opensAt: opening, actions: actions)
        }
    }

    /// Bloquer et signaler vont en bas, séparés, en couleur d'erreur.
    public var isDestructive: Bool {
        self == .block || self == .report
    }

    /// `@MainActor` malgré le type `nonisolated` : `Bundle.module`.
    @MainActor public var title: String {
        switch self {
        case .write: return String(localized: "profile.relation.action.write", defaultValue: "Écrire", bundle: .module)
        case .call: return String(localized: "profile.relation.action.call", defaultValue: "Appeler", bundle: .module)
        case .video: return String(localized: "profile.relation.action.video", defaultValue: "Vidéo", bundle: .module)
        case .talkie: return String(localized: "profile.relation.action.talkie", defaultValue: "Talkie", bundle: .module)
        case .together: return String(localized: "profile.relation.action.together", defaultValue: "Ensemble", bundle: .module)
        case .bring: return String(localized: "profile.relation.action.bring", defaultValue: "Bring", bundle: .module)
        case .location: return String(localized: "profile.relation.action.location", defaultValue: "Position", bundle: .module)
        case .battery: return String(localized: "profile.relation.action.battery", defaultValue: "Batterie", bundle: .module)
        case .unreachable: return String(localized: "profile.relation.action.unreachable", defaultValue: "Injoignable", bundle: .module)
        case .sendProfile: return String(localized: "profile.relation.action.sendProfile", defaultValue: "Envoyer son profil", bundle: .module)
        case .block: return String(localized: "profile.relation.action.block", defaultValue: "Bloquer", bundle: .module)
        case .report: return String(localized: "profile.relation.action.report", defaultValue: "Signaler", bundle: .module)
        }
    }

    /// Le vocabulaire fixe de la planche (brief § 4), en SF Symbols.
    public var systemImage: String {
        switch self {
        case .write: return "bubble.left"
        case .call: return "phone"
        case .video: return "video"
        case .talkie: return "radio"
        case .together: return "play.tv"
        case .bring: return "hand.wave"
        case .location: return "mappin.and.ellipse"
        case .battery: return "battery.50percent"
        case .unreachable: return "phone.down"
        case .sendProfile: return "paperplane"
        case .block: return "nosign"
        case .report: return "flag"
        }
    }
}

/// Offerte, ou verrouillée avec le cercle qui l'ouvre.
public nonisolated enum ProfileRelationGate: Equatable, Sendable {
    case offered
    case locked(opensAt: RelationLevel)
}

/// Les opérations qu'un même cercle ouvrirait : une seule rangée verrouillée (K37) « Talkie, Ensemble · dès Proche ».
public nonisolated struct ProfileRelationLockedGroup: Equatable, Sendable {
    public let opensAt: RelationLevel
    public let actions: [ProfileRelationAction]

    public init(opensAt: RelationLevel, actions: [ProfileRelationAction]) {
        self.opensAt = opensAt
        self.actions = actions
    }

    /// Les noms joints selon la langue (« Talkie, Ensemble et Batterie »).
    @MainActor public func title(locale: Locale = .current) -> String {
        let formatter = ListFormatter()
        formatter.locale = locale
        let titles = actions.map(\.title)
        return formatter.string(from: titles) ?? titles.joined(separator: ", ")
    }

    /// Ce qui l'ouvre, dit sur la rangée verrouillée : « dès Ami ».
    @MainActor public var requirement: String {
        ProfileRelationLockedGroup.requirement(opensAt: opensAt)
    }

    @MainActor public static func requirement(opensAt level: RelationLevel) -> String {
        switch level {
        case .public: return String(localized: "profile.relation.opensAt.public", defaultValue: "pour tous", bundle: .module)
        case .community: return String(localized: "profile.relation.opensAt.community", defaultValue: "dès Communauté", bundle: .module)
        case .acquaintance: return String(localized: "profile.relation.opensAt.acquaintance", defaultValue: "dès Connaissance", bundle: .module)
        case .friend: return String(localized: "profile.relation.opensAt.friend", defaultValue: "dès Ami", bundle: .module)
        case .close: return String(localized: "profile.relation.opensAt.close", defaultValue: "dès Proche", bundle: .module)
        case .blood: return String(localized: "profile.relation.opensAt.blood", defaultValue: "dès Sang", bundle: .module)
        }
    }

    /// Le glyphe de la première opération du groupe.
    public var systemImage: String {
        actions.first?.systemImage ?? "lock"
    }
}
