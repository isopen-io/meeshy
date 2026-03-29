import SwiftUI
import MeeshyUI

// MARK: - Tab Definitions

enum ContactsTab: String, CaseIterable, Hashable {
    case contacts = "Contacts"
    case requests = "Demandes"
    case discover = "Decouvrir"
    case blocked = "Bloques"

    var icon: String {
        switch self {
        case .contacts: return "person.2.fill"
        case .requests: return "person.badge.plus"
        case .discover: return "magnifyingglass"
        case .blocked: return "hand.raised.fill"
        }
    }
}

// MARK: - Filter Enums

enum ContactFilter: String, CaseIterable {
    case all = "Tous"
    case online = "En ligne"
    case offline = "Hors ligne"
    case phonebook = "Repertoire"
    case affiliates = "Affilies"
}

enum RequestFilter: String, CaseIterable {
    case received = "Recues"
    case sent = "Envoyees"
}

// MARK: - Load State

enum LoadState: Equatable {
    case idle
    case cachedStale
    case cachedFresh
    case loading
    case loaded
    case offline
    case error(String)
}

// MARK: - Date Extension

extension Date {
    var relativeTimeString: String {
        let interval = Date().timeIntervalSince(self)
        if interval < 60 { return "A l'instant" }
        if interval < 3600 { return "Il y a \(Int(interval / 60))min" }
        if interval < 86400 { return "Il y a \(Int(interval / 3600))h" }
        if interval < 604800 { return "Il y a \(Int(interval / 86400))j" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "dd MMM"
        return formatter.string(from: self)
    }
}
