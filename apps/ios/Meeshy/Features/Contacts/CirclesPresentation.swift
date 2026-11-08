import Foundation
import MeeshySDK

// « Mes cercles » (#13938) — les types PURS de l'écran : la personne que le serveur ne nomme jamais, ce que la
// ligne d'un lien dit de sa progression, la cible du rituel. Sans état, sans I/O, jouables sans écran.

/// La personne d'un lien. `GET /relations` ne sert jamais un nom (RG-07) : l'écran l'hydrate par ses propres caches.
nonisolated struct CirclePerson: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let username: String?
    let avatarURL: String?
    /// Le contour d'avatar servi avec la personne (#10945) ; `nil` sans contour. Relayé, jamais fabriqué.
    let ring: ServedProfileDecorItem?

    init(id: String, name: String, username: String?, avatarURL: String?, ring: ServedProfileDecorItem? = nil) {
        self.id = id
        self.name = name
        self.username = username
        self.avatarURL = avatarURL
        self.ring = ring
    }
}

/// Ce qu'une fiche de lien laisse régler pour CETTE personne, selon ce que le cercle ouvre (spec § 1.3, § 1.5).
/// Le Bring est disponible par défaut dès Ami (D-3) : son réglage est un BLOCAGE. Le talkie et l'écoute s'ouvrent à
/// Proche, la position continue au Sang. Une Connaissance n'a rien à régler.
nonisolated enum CirclePersonSetting: String, CaseIterable, Identifiable, Sendable {
    case blockBring, talkie, listening, liveLocation

    var id: String { rawValue }

    static func offered(at level: RelationLevel) -> [CirclePersonSetting] {
        allCases.filter { level >= $0.opensAt }
    }

    private var opensAt: RelationLevel {
        switch self {
        case .blockBring: return .friend
        case .talkie, .listening: return .close
        case .liveLocation: return .blood
        }
    }

    /// La préférence de RÉCEPTION que ce réglage pose, quand son lot est livré ; `nil` ⇒ encore derrière son drapeau.
    var receptionSetting: RelationReceptionSetting? {
        switch self {
        case .blockBring: return .bring
        case .talkie: return .talkie
        case .listening, .liveLocation: return nil
        }
    }

    /// Ce que le réglage fait, dit sous l'interrupteur quand il ne s'explique pas seul.
    var detail: String? {
        switch self {
        case .talkie:
            return String(
                localized: "circles.settings.blockTalkie.detail",
                defaultValue: "Sa voix ne sortira plus directement chez vous : elle arrivera en message vocal. Cette personne n’en est pas prévenue.",
                bundle: .main
            )
        case .blockBring, .listening, .liveLocation:
            return nil
        }
    }

    var title: String {
        switch self {
        case .blockBring: return String(localized: "circles.settings.blockBring", defaultValue: "Bloquer ses Bring", bundle: .main)
        case .talkie: return String(localized: "circles.settings.blockTalkie", defaultValue: "Couper son talkie", bundle: .main)
        case .listening: return String(localized: "circles.settings.listening", defaultValue: "Ce que j'écoute", bundle: .main)
        case .liveLocation: return String(localized: "circles.settings.location", defaultValue: "Position en direct", bundle: .main)
        }
    }
}

/// Qui sait nommer une personne à partir de son identifiant. Un identifiant inconnu est ABSENT du résultat : l'écran
/// écrit alors « Inconnu », il n'invente rien.
nonisolated protocol CirclePeopleResolving: Sendable {
    func people(for ids: [String]) async -> [String: CirclePerson]
}

/// La personne avec qui le rituel du Sang s'ouvre.
nonisolated struct CircleRitualTarget: Identifiable, Equatable, Sendable {
    let userId: String
    let name: String
    var id: String { userId }
}

/// Ce que la ligne d'un lien DIT de sa progression. Le client ne décide d'aucun niveau : il lit ce que le serveur sert
/// (`progress`, `eligibleFor`) et ce que la loi de demande lui laisse proposer.
///
/// Ordre des phrases : ce qui MANQUE d'abord (« il manque un message audio »), puis ce qu'on PEUT demander,
/// puis où l'on en est (« 3 semaines sur 4 »), puis rien.
nonisolated enum CircleProgressSummary: Equatable, Sendable {

    enum MissingPiece: Equatable, Sendable {
        case message, reaction, postView, audio, other

        init(wire: String) {
            switch wire {
            case "message": self = .message
            case "reaction": self = .reaction
            case "postView": self = .postView
            case "audio": self = .audio
            default: self = .other
            }
        }
    }

    case missing([MissingPiece])
    case eligible(RelationLevel)
    case weeks(done: Int, needed: Int)
    case none

    static func make(_ link: RelationLink, now: Date = Date()) -> CircleProgressSummary {
        if !link.progress.missing.isEmpty {
            return .missing(distinct(link.progress.missing.map(MissingPiece.init(wire:))))
        }
        switch link.raiseOffer(now: now) {
        case .available(let target):
            return .eligible(target)
        case .locked:
            guard let needed = link.progress.needed, needed > 0 else { return .none }
            return .weeks(done: min(link.progress.activeWeeks, needed), needed: needed)
        case .none:
            return .none
        }
    }

    private static func distinct(_ pieces: [MissingPiece]) -> [MissingPiece] {
        pieces.reduce(into: [MissingPiece]()) { kept, piece in
            if !kept.contains(piece) { kept.append(piece) }
        }
    }
}

/// Les noms et icônes de repli des niveaux, quand la table servie (`GET /relations/config`) n'est pas là : hors ligne
/// au premier lancement, ou passerelle plus ancienne. Un niveau n'est jamais affiché par sa clé.
nonisolated enum CircleLevelNames {

    static func title(of level: RelationLevel) -> String {
        switch level {
        case .blood: return String(localized: "circles.level.blood", defaultValue: "Sang", bundle: .main)
        case .close: return String(localized: "circles.level.close", defaultValue: "Proche", bundle: .main)
        case .friend: return String(localized: "circles.level.friend", defaultValue: "Ami", bundle: .main)
        case .acquaintance: return String(localized: "circles.level.acquaintance", defaultValue: "Connaissance", bundle: .main)
        case .community: return String(localized: "circles.level.community", defaultValue: "Communauté", bundle: .main)
        case .public: return String(localized: "circles.level.public", defaultValue: "Public", bundle: .main)
        }
    }

    static func icon(of level: RelationLevel) -> String {
        switch level {
        case .blood: return "🩸"
        case .close: return "🔥"
        case .friend: return "🤝"
        case .acquaintance: return "👋"
        case .community: return "👥"
        case .public: return "🌐"
        }
    }
}

extension CircleProgressSummary {

    /// La phrase de la ligne, ou `nil` quand il n'y a rien à dire. « Semaines d'affilée : 3 sur 4 » plutôt que
    /// « 3 semaines sur 4 » : la forme neutre ne dépend d'aucune règle de pluriel, et les sept langues du catalogue en
    /// ont de très différentes (l'arabe en compte six).
    nonisolated func text(levelTitle: (RelationLevel) -> String) -> String? {
        switch self {
        case .none:
            return nil
        case .weeks(let done, let needed):
            let format = String(localized: "circles.progress.weeks", defaultValue: "Semaines d'affilée : %lld sur %lld", bundle: .main)
            return String(format: format, done, needed)
        case .eligible(let target):
            let format = String(localized: "circles.progress.eligible", defaultValue: "Prêt pour le niveau %@", bundle: .main)
            return String(format: format, levelTitle(target))
        case .missing(let pieces):
            let format = String(localized: "circles.progress.missing", defaultValue: "Il manque : %@", bundle: .main)
            return String(format: format, pieces.map(\.noun).joined(separator: ", "))
        }
    }
}

extension CircleProgressSummary.MissingPiece {

    nonisolated var noun: String {
        switch self {
        case .audio: return String(localized: "circles.missing.audio", defaultValue: "un message audio", bundle: .main)
        case .message: return String(localized: "circles.missing.message", defaultValue: "un message", bundle: .main)
        case .reaction: return String(localized: "circles.missing.reaction", defaultValue: "une réaction", bundle: .main)
        case .postView: return String(localized: "circles.missing.postView", defaultValue: "une vue de post", bundle: .main)
        case .other: return String(localized: "circles.missing.other", defaultValue: "une interaction", bundle: .main)
        }
    }
}

/// Le dépliant de chaque partage du rituel du Sang (#13942, § 6) : ce que ça montre, à qui, combien de temps, où c'est
/// gardé, comment arrêter. Textes à valider par le juriste (§ 10) ; la version enregistrée du texte (#14402) et la
/// route de retrait (#14401) viendront côté serveur.
nonisolated enum BloodRitualConsentCopy {

    static var foldingTitle: String {
        String(localized: "circles.ritual.consent.folding.title", defaultValue: "Ce que ça montre, à qui, combien de temps, comment arrêter", bundle: .main)
    }

    /// Où retirer un consentement : la fiche de la personne, à la même place que l'activation (E3). La route de
    /// retrait n'existe pas encore (#14401) : l'écran le dit.
    static var withdrawal: String {
        String(localized: "circles.ritual.consent.withdrawal", defaultValue: "Tu pourras retirer chaque partage à tout moment, depuis la fiche de cette personne. Bientôt disponible.", bundle: .main)
    }

    static func folding(for key: RelationRitualConsentKey, otherName: String) -> String {
        switch key {
        case .listeningTitle:
            return String(localized: "circles.ritual.consent.listeningTitle.folding", defaultValue: "Un titre peut en dire beaucoup sur toi (croyances, opinions, goûts). Rien n'est gardé après la fin de l'écoute. Tu peux exclure des applications.", bundle: .main)
        case .locationLive:
            return String(localized: "circles.ritual.consent.locationLive.folding", defaultValue: "Même quand l'app est fermée. Tu sais toujours quand c'est actif (bandeau). Le mode fantôme te cache, sans qu'on le sache. Tu vois qui a regardé ta position et quand (30 jours). Tu arrêtes en un geste. On te redemandera dans 30 jours.", bundle: .main)
        case .locationHistory:
            return String(localized: "circles.ritual.consent.locationHistory.folding", defaultValue: "Meeshy garde tes positions 30 jours, chiffrées sur ses serveurs, puis les efface. Rien n'est enregistré en mode fantôme.", bundle: .main)
        case .locationProximity:
            let format = String(localized: "circles.ritual.consent.locationProximity.folding", defaultValue: "Seulement si %@ l'a accepté aussi. Rien n'est gardé de l'endroit.", bundle: .main)
            return String(format: format, otherName)
        }
    }
}
