import Foundation
import MeeshySDK

// MARK: - Views Sub-Filter

/// Les onglets de la fiche « Vu par » (`MessageViewsDetailView`). Extraits de
/// la vue (#7366) : elle touchait le plafond de 1 200 lignes, et l'onglet
/// d'ouverture est une règle PURE qui s'éprouve sans monter SwiftUI.
enum MessageViewsFilter: String, CaseIterable, Identifiable {
    case sent, delivered, read, notSeen, listened, watched, opened

    var id: String { rawValue }

    var label: String {
        switch self {
        case .sent: return String(localized: "message-detail.views.sent", defaultValue: "Envoyé", bundle: .main)
        case .delivered: return String(localized: "message-detail.views.delivered", defaultValue: "Distribué", bundle: .main)
        case .read: return String(localized: "message-detail.views.read", defaultValue: "Lu", bundle: .main)
        case .notSeen: return String(localized: "message-detail.views.not-seen", defaultValue: "Non vu", bundle: .main)
        case .listened: return String(localized: "message-detail.views.listened", defaultValue: "Écouté", bundle: .main)
        case .watched: return String(localized: "message-detail.views.watched", defaultValue: "Vu", bundle: .main)
        case .opened: return String(localized: "message-detail.views.opened", defaultValue: "Ouvert", bundle: .main)
        }
    }

    var icon: String {
        switch self {
        case .sent: return "paperplane.fill"
        case .delivered: return "checkmark.circle.fill"
        case .read: return "eye.fill"
        case .notSeen: return "eye.slash.fill"
        case .listened: return "headphones"
        case .watched: return "play.rectangle.fill"
        case .opened: return "doc.viewfinder"
        }
    }

    /// La famille de consommation que cet onglet montre, s'il en montre une.
    /// Les quatre onglets de statut TEXTE (envoyé, distribué, lu, pas vu)
    /// n'en ont aucune.
    var family: MediaConsumptionFamily? {
        switch self {
        case .listened: return .listened
        case .watched: return .watched
        case .opened: return .opened
        default: return nil
        }
    }

    init(family: MediaConsumptionFamily) {
        switch family {
        case .listened: self = .listened
        case .watched: self = .watched
        case .opened: self = .opened
        }
    }

    /// #7366 — l'onglet sur lequel la fiche S'OUVRE. Elle s'ouvrait toujours
    /// sur « Envoyé », qui ne dit que l'heure d'envoi : toucher les coches ✓✓
    /// d'un message lu demandait un second geste pour voir QUI l'a lu.
    ///
    /// L'onglet le plus avancé qui a au moins une personne à montrer : un
    /// lecteur ⇒ « Lu », sinon un destinataire servi ⇒ « Distribué », sinon
    /// « Envoyé ». Ce n'est PAS le palier tout-ou-rien de la coche
    /// (`DeliveryStatusResolver`) : 1 lecteur sur 10 laisse la coche à ✓, et
    /// c'est précisément ce lecteur que l'on vient chercher.
    ///
    /// Qui cache ses accusés (`showReadReceipts == false`) ne voit « Lu » nulle
    /// part : la fiche ne s'ouvre donc jamais sur cet onglet pour lui.
    static func initial(
        readCount: Int, deliveredCount: Int, showReadReceipts: Bool
    ) -> MessageViewsFilter {
        if showReadReceipts, readCount > 0 { return .read }
        if deliveredCount > 0 || readCount > 0 { return .delivered }
        return .sent
    }
}

// MARK: - Libellés de la fiche

/// #7366 — les libellés que la fiche composait en dur, en français sans
/// accents (« Distribue a tous », « Lu par tous », « Erreur serveur ») : les
/// six autres langues du catalogue les lisaient tels quels. `bundle` est un
/// paramètre pour que le témoin résolve chaque langue sans changer celle du
/// simulateur.
enum MessageViewsLabels {

    /// Pourquoi `GET /messages/:messageId/read-status` n'a rien rendu.
    enum LoadFailure: Equatable {
        /// La réponse est arrivée avec `success == false`.
        case server
        /// Aucune réponse exploitable : réseau ou décodage.
        case connection
    }

    static func deliveredBanner(receivedCount: Int, totalMembers: Int, bundle: Bundle = .main) -> String {
        guard receivedCount >= totalMembers else {
            return String(localized: "message-detail.views.delivered", defaultValue: "Distribué", bundle: bundle)
        }
        return String(localized: "message-detail.views.delivered.all", defaultValue: "Distribué à tous", bundle: bundle)
    }

    static func readBanner(readCount: Int, totalMembers: Int, bundle: Bundle = .main) -> String {
        guard readCount >= totalMembers else {
            return String(localized: "message-detail.views.read", defaultValue: "Lu", bundle: bundle)
        }
        return String(localized: "message-detail.views.read.all", defaultValue: "Lu par tous", bundle: bundle)
    }

    static func loadFailure(_ failure: LoadFailure, bundle: Bundle = .main) -> String {
        switch failure {
        case .server:
            return String(localized: "message-detail.error.server", defaultValue: "Erreur serveur", bundle: bundle)
        case .connection:
            return String(localized: "message-detail.error.connection", defaultValue: "Erreur de connexion", bundle: bundle)
        }
    }
}
