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

    /// Localized display name. The raw enum value stays the stable French key
    /// used for `.tag`/persistence; the hub's header, its tab bar and
    /// `Route.contacts(_:).displayTitle` all read this instead.
    var title: String {
        switch self {
        case .calls:
            return String(localized: "contacts.tab.calls", defaultValue: "Appels", bundle: .main)
        case .keypad:
            return String(localized: "contacts.tab.keypad", defaultValue: "Clavier", bundle: .main)
        case .contacts:
            return String(localized: "contacts.tab.contacts", defaultValue: "Contacts", bundle: .main)
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

    /// Libellé affiché. Le `rawValue` reste la clé stable d'identité et de
    /// persistance (littéraux FR non accentués) ; ce titre est la SEULE
    /// surface livrée à l'écran, donc il passe par `String(localized:)`.
    /// Même doctrine que `PeopleTab.title` et `RequestFilter`.
    var title: String {
        switch self {
        case .all:
            return String(localized: "contacts.list.filter.all", defaultValue: "Tous", bundle: .main)
        case .online:
            return String(localized: "contacts.list.filter.online", defaultValue: "En ligne", bundle: .main)
        case .offline:
            return String(localized: "contacts.list.filter.offline", defaultValue: "Hors ligne", bundle: .main)
        case .phonebook:
            return String(localized: "contacts.list.filter.phonebook", defaultValue: "Répertoire", bundle: .main)
        case .affiliates:
            return String(localized: "contacts.list.filter.affiliates", defaultValue: "Affiliés", bundle: .main)
        }
    }
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


// MARK: - Briques partagées de l'annuaire

/// Champ de recherche de l'annuaire. Trois écrans le posaient à l'identique
/// (contacts, répertoire, affiliés) : une seule définition, un seul style.
struct ContactsSearchField: View {
    let placeholder: String
    @Binding var query: String

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.subheadline.weight(.medium))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)

            TextField(placeholder, text: $query)
                .font(.subheadline)
                .foregroundColor(theme.textPrimary)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)

            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.subheadline)
                        .foregroundColor(theme.textMuted)
                }
                .accessibilityLabel(String(localized: "common.clear-search", defaultValue: "Effacer la recherche", bundle: .main))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(theme.inputBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

/// Ligne « une personne + une action » de l'annuaire : répertoire, relais de
/// recherche plateforme, affiliés. Les trois affichaient le même bloc
/// avatar / nom / identifiant / bouton — une seule vue le rend désormais.
///
/// `Equatable` sur ses seules entrées de VALEUR (les closures en sont
/// exclues) : une cellule ne se réévalue que si la personne qu'elle montre
/// change. `isDark` en fait partie, sinon un basculement de thème laisserait
/// la ligne figée dans les couleurs de l'ancien mode.
struct DirectoryPersonRow: View, Equatable {
    /// Ce que la ligne propose de faire. `write` pour un compte Meeshy,
    /// `invite` pour un contact du carnet qui n'en a pas.
    enum Action: Equatable {
        case write
        case invite

        var icon: String {
            switch self {
            case .write: return "bubble.left.fill"
            case .invite: return "paperplane.fill"
            }
        }

        var title: String {
            switch self {
            case .write:
                return String(localized: "contacts.phonebook.write", defaultValue: "Lui ecrire", bundle: .main)
            case .invite:
                return String(localized: "contacts.phonebook.invite", defaultValue: "Inviter", bundle: .main)
            }
        }

        /// L'action principale est pleine, l'invitation reste discrète.
        var isFilled: Bool { self == .write }
    }

    let name: String
    let subtitle: String?
    let avatarURL: String?
    let action: Action
    /// Complément lu par VoiceOver après le nom (« sur Meeshy », etc.).
    var accessibilityDetail: String?
    let isDark: Bool
    let onAction: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    static func == (lhs: DirectoryPersonRow, rhs: DirectoryPersonRow) -> Bool {
        lhs.name == rhs.name
            && lhs.subtitle == rhs.subtitle
            && lhs.avatarURL == rhs.avatarURL
            && lhs.action == rhs.action
            && lhs.accessibilityDetail == rhs.accessibilityDetail
            && lhs.isDark == rhs.isDark
    }

    var body: some View {
        HStack(spacing: 14) {
            MeeshyAvatar(
                name: name,
                context: .userListItem,
                accentColor: DynamicColorGenerator.colorForName(name),
                avatarURL: avatarURL
            )

            VStack(alignment: .leading, spacing: 3) {
                Text(name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.caption.weight(.medium))
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            Button(action: onAction) {
                HStack(spacing: 5) {
                    Image(systemName: action.icon).font(.caption2.weight(.bold))
                    Text(action.title).font(.caption.weight(.semibold))
                }
                .foregroundColor(action.isFilled ? .white : MeeshyColors.indigo500)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(
                    Capsule().fill(action.isFilled ? MeeshyColors.indigo500 : Color.clear)
                )
                .overlay(
                    Capsule().stroke(action.isFilled ? Color.clear : MeeshyColors.indigo500.opacity(0.5), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel(action.title)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(accessibilityDetail.map { "\(name), \($0)" } ?? name)
    }
}
