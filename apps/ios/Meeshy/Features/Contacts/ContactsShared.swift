import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Tab Definitions

/// Top-level tabs of the People hub. The three primary surfaces of the
/// redesigned contact view: the call journal, the dial pad, and the contact
/// directory (an annuaire filtered by `ContactFilter`).
enum PeopleTab: String, CaseIterable, Hashable {
    case calls = "Appels"
    case keypad = "Clavier"
    case contacts = "Contacts"

    var icon: String {
        switch self {
        case .calls: return "phone.fill"
        case .keypad: return "circle.grid.3x3.fill"
        case .contacts: return "person.2.fill"
        }
    }
}

/// Sub-tabs of the **Découverte d'utilisateurs Meeshy** view (`PeopleDiscoveryView`).
///
/// Moved out of the contact directory so the Contacts tab stays an exploitable
/// annuaire. Reachable from the floating menu ladder and from deep links
/// (`Route.peopleDiscovery(DiscoveryTab)`). Order is the on-screen order:
/// Decouvrir (the search landing) first, then Demandes, then Bloques.
enum DiscoveryTab: String, CaseIterable, Hashable {
    case discover = "Decouvrir"
    case requests = "Demandes"
    case blocked = "Bloques"

    var icon: String {
        switch self {
        case .discover: return "magnifyingglass"
        case .requests: return "person.badge.plus"
        case .blocked: return "hand.raised.fill"
        }
    }
}

// MARK: - Filter Enums

/// Filtres de l'annuaire. `online`/`offline` partitionnent sur le flag binaire
/// backend `isOnline` — contexte LABELLISÉ explicite, distinct de la règle
/// d'affichage des dots 1/3/5 (`UserPresence.state`) : un contact « Hors
/// ligne » du filtre peut encore porter un dot orange/gris (< 5 min).
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
        RelativeTimeFormatter.longString(for: self)
    }
}

// MARK: - Collapsing-header scroll plumbing
//
// Each Contacts tab reports its vertical scroll offset up to `ContactsHubView`
// so the hub's `CollapsibleHeader` collapses while the tab chips and the search
// bar stay pinned below the header.
//
// Usage in a tab:
// ```
// ScrollView {
//     ContactsScrollSentinel()   // first child
//     ...content...
// }
// .reportsContactsScroll(active: isActive, onChange: onScrollOffsetChange)
// ```

enum ContactsScrollOffset {
    static let space = "contactsScroll"
}

struct ContactsScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

/// Zero-height marker placed as the FIRST child inside a `ScrollView`'s content.
/// Reports the content top within the scroll viewport: `0` at rest, negative once
/// scrolled up.
struct ContactsScrollSentinel: View {
    var body: some View {
        GeometryReader { proxy in
            Color.clear.preference(
                key: ContactsScrollOffsetKey.self,
                value: proxy.frame(in: .named(ContactsScrollOffset.space)).minY
            )
        }
        .frame(height: 0)
    }
}

extension View {
    /// Apply to a `ScrollView` that contains a `ContactsScrollSentinel` as its
    /// first child. Forwards the offset (only while `active`, so off-screen paged
    /// tabs stay silent) to drive the hub's collapsing header.
    func reportsContactsScroll(active: Bool, onChange: @escaping (CGFloat) -> Void) -> some View {
        coordinateSpace(name: ContactsScrollOffset.space)
            // iOS 16–17: the sentinel preference drives the offset.
            .onPreferenceChange(ContactsScrollOffsetKey.self) { value in
                if active { onChange(value) }
            }
            // iOS 18+: `.onPreferenceChange` no longer re-fires on scroll, so read
            // `contentOffset.y` natively (negated to match the sentinel's minY sign).
            .trackScrollContentOffset { value in
                if active { onChange(-value) }
            }
    }
}

// MARK: - Friend List Aggregation

/// Single source of truth for building the user's friend (contact) list from
/// their accepted friend requests. The gateway exposes friendships only as
/// `/friend-requests/received` + `/friend-requests/sent`; a "friend" is any
/// request with `status == "accepted"`, in either direction. Shared by
/// `ContactsListViewModel` (the Contacts directory) and
/// `NewConversationViewModel` (the contact-first conversation picker) so the
/// definition of "who is a contact" never drifts between the two surfaces.
enum FriendListAggregator {
    /// Merges accepted received + sent requests into a deduplicated,
    /// online-first friend list. `currentUserId` is excluded defensively so a
    /// self-referencing request can never surface the user as their own
    /// contact. Pure function — no I/O, trivially testable.
    static func aggregate(
        received: [FriendRequest],
        sent: [FriendRequest],
        currentUserId: String
    ) -> [FriendRequestUser] {
        var friendMap: [String: FriendRequestUser] = [:]

        for request in received where request.status == "accepted" {
            if let sender = request.sender, sender.id != currentUserId {
                friendMap[sender.id] = sender
            } else if let receiver = request.receiver, receiver.id != currentUserId {
                friendMap[receiver.id] = receiver
            }
        }

        for request in sent where request.status == "accepted" {
            if let receiver = request.receiver, receiver.id != currentUserId {
                friendMap[receiver.id] = receiver
            } else if let sender = request.sender, sender.id != currentUserId {
                friendMap[sender.id] = sender
            }
        }

        return friendMap.values.sorted { a, b in
            let aOnline = a.isOnline ?? false
            let bOnline = b.isOnline ?? false
            if aOnline != bOnline { return aOnline }
            let aDate = a.lastActiveAt ?? .distantPast
            let bDate = b.lastActiveAt ?? .distantPast
            return aDate > bDate
        }
    }
}
