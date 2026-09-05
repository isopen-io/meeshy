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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
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
    ///
    /// **Le seuil de l'appel distant est `MentionLookupRule`** (directive
    /// porteur 2026-09-05), pas `!trimmed.isEmpty`. Ce modèle partait dès la
    /// PREMIÈRE lettre ; son jumeau applicatif
    /// (`MentionComposerController`) partait dès le `@` NU. Deux familles de
    /// résolveurs, deux seuils, neuf sites de montage — donc trois régimes
    /// pour un même geste selon l'écran où le doigt se trouvait.
    func update(query: String) {
        searchTask?.cancel()
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let local = trimmed.isEmpty ? contacts : contacts.filter {
            $0.username.localizedCaseInsensitiveContains(trimmed)
                || ($0.displayName ?? "").localizedCaseInsensitiveContains(trimmed)
        }
        candidates = local
        guard MentionLookupRule.queriesRemote(trimmed) else { return }
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
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
///
/// `contextMenu:` est la SECONDE porte de la grammaire de geste : le tap pose
/// le mode par défaut de la surface, l'appui long ouvre le choix. Un appelant
/// qui ne le fournit pas garde une liste à un seul geste — et surtout AUCUN
/// menu attaché, un `.contextMenu` vide ouvrant une bulle sans entrée.
public struct MentionSuggestionList<Menu: View>: View {
    let query: String
    /// Hauteur maximale du panneau. 200 pt au-dessus d'un champ de saisie (on
    /// ne masque pas ce qu'on écrit) ; sans borne dans une sheet dédiée.
    let maxHeight: CGFloat
    let onSelect: (UserSearchResult) -> Void
    let contextMenu: (UserSearchResult) -> Menu
    /// `Menu == EmptyView` peut venir d'un appelant qui n'en veut pas comme
    /// d'un menu réellement vide : seul l'init sait laquelle des deux surfaces
    /// a été demandée, et c'est lui qui pose ce drapeau.
    private let attachesContextMenu: Bool
    @StateObject private var model = MentionSuggestionsModel()

    public init(query: String,
                maxHeight: CGFloat = 200,
                onSelect: @escaping (UserSearchResult) -> Void,
                @ViewBuilder contextMenu: @escaping (UserSearchResult) -> Menu) {
        self.init(query: query, maxHeight: maxHeight, onSelect: onSelect,
                  contextMenu: contextMenu, attachesContextMenu: true)
    }

    private init(query: String,
                 maxHeight: CGFloat,
                 onSelect: @escaping (UserSearchResult) -> Void,
                 contextMenu: @escaping (UserSearchResult) -> Menu,
                 attachesContextMenu: Bool) {
        self.query = query
        self.maxHeight = maxHeight
        self.onSelect = onSelect
        self.contextMenu = contextMenu
        self.attachesContextMenu = attachesContextMenu
    }

    public var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            LazyVStack(spacing: 0) {
                ForEach(model.candidates) { user in
                    row(for: user)
                    if user.id != model.candidates.last?.id {
                        Divider().padding(.leading, 58)
                    }
                }
                if model.candidates.isEmpty {
                    Text(String(localized: "mention.suggestions.empty",
                                defaultValue: "Aucune personne trouvée",
                                bundle: .module))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize))
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

    /// Le menu est posé SUR le `Button`, jamais dans son label : un `Button`
    /// avale la séquence de gestes, et l'appui long n'ouvrirait alors jamais
    /// rien (piège déjà payé sur le scrub de story).
    @ViewBuilder
    private func row(for user: UserSearchResult) -> some View {
        if attachesContextMenu {
            rowButton(for: user).contextMenu { contextMenu(user) }
        } else {
            rowButton(for: user)
        }
    }

    private func rowButton(for user: UserSearchResult) -> some View {
        Button { onSelect(user) } label: { MentionSuggestionRow(user: user) }
            .buttonStyle(.plain)
    }
}

public extension MentionSuggestionList where Menu == EmptyView {
    /// Liste à un seul geste — la frappe `@` d'une surface qui n'offre pas
    /// encore le choix de mode.
    init(query: String,
         maxHeight: CGFloat = 200,
         onSelect: @escaping (UserSearchResult) -> Void) {
        self.init(query: query, maxHeight: maxHeight, onSelect: onSelect,
                  contextMenu: { _ in EmptyView() }, attachesContextMenu: false)
    }
}

struct MentionSuggestionRow: View {
    let user: UserSearchResult

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            MeeshyAvatar(name: user.displayName ?? user.username,
                         context: .userListItem,
                         avatarURL: user.avatar)
            VStack(alignment: .leading, spacing: 1) {
                Text(user.displayName ?? user.username)
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .lineLimit(1)
                Text("@\(user.username)")
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.sm)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(String(localized: "mention.suggestions.a11y.mention", defaultValue: "Mentionner", bundle: .module)) \(user.displayName ?? user.username)")
    }
}

// MARK: - Picker plein (chip « Mentionner » des composers)

/// La feuille du chip « Mentionner ».
///
/// Elle NE SE FERME PAS au tap : on en ajoute plusieurs d'affilée sans rouvrir
/// quoi que ce soit. Les déjà-référencées remontent en tête avec la pastille de
/// leur mode ; un tap dessus rouvre le même menu — changer de mode et choisir un
/// mode sont le même geste, il n'y a rien de nouveau à apprendre.
///
/// Elle PILOTE l'ensemble et rend l'ensemble MIS À JOUR : elle ne décide de
/// rien d'autre, le composer appelant choisissant quoi en faire (poser un badge
/// sur le canevas, par exemple) — règle de pureté SDK.
public struct StoryMentionPickerSheet: View {
    let references: [ComposerReference]
    /// Les modes que CE contenu peut réellement montrer. Un post n'a aucune
    /// couche de positionnement : lui proposer un badge promettrait un
    /// affichage qui n'arriverait jamais.
    let modes: [PostReferenceDisplay]
    let onChange: ([ComposerReference]) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    public init(references: [ComposerReference],
                modes: [PostReferenceDisplay] = PostReferenceDisplay.declarable,
                onChange: @escaping ([ComposerReference]) -> Void) {
        self.references = references
        self.modes = modes
        self.onChange = onChange
    }

    public var body: some View {
        // En-tête explicite plutôt qu'une `NavigationStack` : la sheet est
        // présentée depuis le composer, un `fullScreenCover` sans barre d'état,
        // qui met les insets de safe area à zéro — la même raison qui a fait
        // écrire l'en-tête à la main dans `AudienceUserPickerView`.
        VStack(spacing: 0) {
            header
            searchField
            if !references.isEmpty { alreadyReferenced }
            if query.isEmpty {
                sectionTitle(String(localized: "reference.sheet.contacts",
                                    defaultValue: "Contacts", bundle: .module))
            }
            MentionSuggestionList(query: query, maxHeight: .infinity) { user in
                // Tap = SILENT : depuis ce chip on nomme quelqu'un SANS
                // l'écrire, donc le plus discret gagne. Pas de `dismiss()` —
                // on en ajoute plusieurs d'affilée.
                onChange(ReferencePickerLogic.apply(
                    .tap, username: user.username, userId: user.id,
                    to: references, context: .picker
                ))
                HapticFeedback.light()
            } contextMenu: { user in
                ReferenceModeMenu(modes: modes) { mode in
                    onChange(ReferencePickerLogic.apply(
                        .choose(mode), username: user.username, userId: user.id,
                        to: references, context: .picker
                    ))
                }
            }
        }
        .modifier(AudiencePickerPresentationStyle())
    }

    private var header: some View {
        ZStack {
            Text(String(localized: "reference.sheet.title", defaultValue: "Mentionner", bundle: .module))
                .font(MeeshyFont.relative(16, weight: .semibold))
            HStack {
                Spacer()
                // « Terminé » et non « Annuler » : chaque choix est déjà
                // appliqué au composer, il n'y a plus rien à annuler ici.
                Button(String(localized: "common.done", defaultValue: "Terminé", bundle: .module)) { dismiss() }
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.sm)
    }

    private var searchField: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "at").foregroundStyle(.secondary)
            TextField(String(localized: "story.mention.search", defaultValue: "Rechercher une personne…", bundle: .module),
                      text: $query)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.sm)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(Color(.secondarySystemBackground)))
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.sm)
    }

    /// Les personnes déjà nommées, avec la pastille de leur mode. C'est le seul
    /// endroit d'où une référence SILENCIEUSE se voit — et donc le seul d'où
    /// elle se retire.
    private var alreadyReferenced: some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionTitle(String(localized: "reference.sheet.alreadyReferenced",
                                defaultValue: "Déjà référencées", bundle: .module))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(references, id: \.username) { reference in
                        referenceChip(reference)
                    }
                }
                .padding(.horizontal, 16)
            }
            // Nommer quelqu'un lui ouvre le contenu même hors de l'audience
            // choisie : c'est une conséquence du geste, elle se dit là où le
            // geste se pose.
            Text(String(localized: "reference.audienceWarning",
                        defaultValue: "Cette personne pourra voir ce contenu même hors de l'audience choisie",
                        bundle: .module))
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 16)
        }
        .padding(.bottom, 10)
    }

    private func sectionTitle(_ text: String) -> some View {
        HStack {
            Text(text)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 4)
    }

    private func referenceChip(_ reference: ComposerReference) -> some View {
        HStack(spacing: 4) {
            // `Menu` et non `contextMenu` : sur une pastille déjà posée, le
            // geste attendu est un TAP — changer de mode et en choisir un sont
            // le même geste.
            Menu {
                ReferenceModeMenu(modes: modes) { mode in
                    onChange(ReferencePickerLogic.apply(
                        .choose(mode), username: reference.username, userId: reference.userId,
                        to: references, context: .picker
                    ))
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: reference.display.symbolName)
                        .font(.system(size: 11, weight: .semibold))
                    Text("@\(reference.username)")
                        .font(.system(size: 13, weight: .medium))
                        .lineLimit(1)
                }
                .foregroundStyle(reference.display == .silent ? Color.secondary : Color.primary)
            }

            Button {
                onChange(ComposerReferences.remove(username: reference.username, from: references))
                HapticFeedback.light()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .module)) @\(reference.username)")
        }
        .padding(.leading, 12)
        .padding(.trailing, 10)
        .padding(.vertical, 7)
        .frame(minHeight: 36)
        .background(Capsule().fill(Color(.secondarySystemBackground)))
    }
}
