import SwiftUI
import MeeshySDK
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
//
// `LoadState` lives in MeeshySDK (`Cache/LoadState.swift`) and is the
// single source of truth across the app — Contacts, Conversations, Feed
// all share the same set of cases. The local re-declaration that used
// to live here is gone; consumers `import MeeshySDK` to get it.

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
