import SwiftUI
import Combine
import MeeshySDK

// MARK: - Modèle

/// Résout les personnes proposées pour un `@…` en cours de frappe.
///
/// Cache-first, comme le picker d'audience dont il partage les deux mêmes
/// coutures (`AudienceUserSearching`, `AudienceContactsProviding`) : les
/// contacts locaux répondent INSTANTANÉMENT, la recherche réseau complète
/// ensuite. Une liste qui n'arrive qu'après un aller-retour n'aide personne à
/// la vitesse où l'on tape un pseudo.
@MainActor
final class MentionSuggestionsModel: ObservableObject {
    @Published private(set) var candidates: [UserSearchResult] = []
    @Published private(set) var isSearching = false

    private let userService: AudienceUserSearching
    private let contactsProvider: AudienceContactsProviding
    private let currentUserId: String?
    private var contacts: [UserSearchResult] = []
    private var didLoadContacts = false
    private var searchTask: Task<Void, Never>?

    init(currentUserId: String? = AuthManager.shared.currentUser?.id,
         userService: AudienceUserSearching = UserService.shared,
         contactsProvider: AudienceContactsProviding = FriendsCacheAudienceContacts()) {
        self.currentUserId = currentUserId
        self.userService = userService
        self.contactsProvider = contactsProvider
    }

    /// Une seule fois par vie de la vue : les contacts ne bougent pas entre
    /// deux frappes, et les relire à chaque caractère ferait un accès disque
    /// par touche.
    func loadContactsIfNeeded() async {
        guard !didLoadContacts else { return }
        didLoadContacts = true
        contacts = await contactsProvider.cachedContacts().filter { $0.id != currentUserId }
        if candidates.isEmpty { candidates = contacts }
    }

    /// Le filtre local s'applique TOUT DE SUITE ; la recherche réseau est
    /// débattue de 300 ms puis fusionnée. Annuler la précédente est ce qui
    /// empêche une réponse lente d'écraser une frappe plus récente.
    func update(query: String) {
        searchTask?.cancel()
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let local = trimmed.isEmpty ? contacts : contacts.filter {
            $0.username.localizedCaseInsensitiveContains(trimmed)
                || ($0.displayName ?? "").localizedCaseInsensitiveContains(trimmed)
        }
        candidates = local
        guard !trimmed.isEmpty else { return }
        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard let self, !Task.isCancelled else { return }
            self.isSearching = true
            defer { self.isSearching = false }
            guard let found = try? await self.userService.searchUsers(query: trimmed, limit: 20, offset: 0),
                  !Task.isCancelled else { return }
            let known = Set(local.map(\.id))
            self.candidates = local + found.filter { $0.id != self.currentUserId && !known.contains($0.id) }
        }
    }
}

// MARK: - Liste de suggestions

/// Panneau de suggestions posé AU-DESSUS d'un champ de saisie, pendant qu'un
/// `@…` est en cours de frappe. Le choix rend le PSEUDO à l'appelant, qui
/// décide quoi en faire — l'insérer dans un texte, ou poser une pastille sur
/// un canevas.
struct MentionSuggestionList: View {
    let query: String
    /// Hauteur maximale du panneau. 200 pt au-dessus d'un champ de saisie (on
    /// ne masque pas ce qu'on écrit) ; sans borne dans une sheet dédiée.
    var maxHeight: CGFloat = 200
    let onSelect: (UserSearchResult) -> Void
    @StateObject private var model = MentionSuggestionsModel()

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            LazyVStack(spacing: 0) {
                ForEach(model.candidates) { user in
                    Button { onSelect(user) } label: { MentionSuggestionRow(user: user) }
                        .buttonStyle(.plain)
                    if user.id != model.candidates.last?.id {
                        Divider().padding(.leading, 58)
                    }
                }
                if model.candidates.isEmpty {
                    Text(String(localized: "mention.suggestions.empty",
                                defaultValue: "Aucune personne trouvée",
                                bundle: .module))
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
            }
        }
        .frame(maxHeight: maxHeight)
        .task {
            await model.loadContactsIfNeeded()
            model.update(query: query)
        }
        .adaptiveOnChange(of: query) { _, newValue in
            model.update(query: newValue)
        }
    }
}

struct MentionSuggestionRow: View {
    let user: UserSearchResult

    var body: some View {
        HStack(spacing: 10) {
            MeeshyAvatar(name: user.displayName ?? user.username,
                         context: .userListItem,
                         avatarURL: user.avatar)
            VStack(alignment: .leading, spacing: 1) {
                Text(user.displayName ?? user.username)
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(1)
                Text("@\(user.username)")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(String(localized: "mention.suggestions.a11y.mention", defaultValue: "Mentionner", bundle: .module)) \(user.displayName ?? user.username)")
    }
}

// MARK: - Picker plein (action « @ » du composer de story)

/// Épingler quelqu'un sur une story SANS l'écrire dans une phrase (directive
/// user 2026-08-18). Le geste est une ACTION, pas une frappe : on cherche, on
/// choisit, une pastille se pose sur le canevas.
struct StoryMentionPickerSheet: View {
    let onSelect: (UserSearchResult) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    var body: some View {
        // En-tête explicite plutôt qu'une `NavigationStack` : la sheet est
        // présentée depuis le composer, un `fullScreenCover` sans barre d'état,
        // qui met les insets de safe area à zéro — la même raison qui a fait
        // écrire l'en-tête à la main dans `AudienceUserPickerView`.
        VStack(spacing: 0) {
            ZStack {
                Text(String(localized: "story.mention.title", defaultValue: "Mentionner", bundle: .module))
                    .font(.system(size: 16, weight: .semibold))
                HStack {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler")) { dismiss() }
                    Spacer()
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 10)

            HStack(spacing: 10) {
                Image(systemName: "at").foregroundStyle(.secondary)
                TextField(String(localized: "story.mention.search", defaultValue: "Rechercher une personne…", bundle: .module),
                          text: $query)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
            .padding(.horizontal, 16)
            .padding(.bottom, 8)

            MentionSuggestionList(query: query, maxHeight: .infinity) { user in
                onSelect(user)
                dismiss()
            }
        }
        .modifier(AudiencePickerPresentationStyle())
    }
}
