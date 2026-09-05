import Foundation
import MeeshySDK
import MeeshyUI
import os

// MARK: - MentionComposerController

/// Manages mention autocomplete for any text composer (conversation, story comment, etc.).
/// Context-aware: routes API suggestions to the correct endpoint based on `Context`.
@MainActor
public final class MentionComposerController: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    // MARK: - Context

    public enum Context: Equatable, Sendable {
        case conversation(id: String)
        case post(id: String)

        /// **Un brouillon composer PAS ENCORE publié (#3904).** Aucun id
        /// serveur n'existe tant que le contenu n'est pas envoyé — donc aucun
        /// appel réseau n'est possible. Les candidats servis viennent
        /// UNIQUEMENT de `localCandidates` (les amis acceptés, cf. site de
        /// montage). `remoteContext` rend `nil` pour ce cas, et
        /// `handleQuery` s'arrête avant de programmer le débounce distant.
        case composerDraft

        /// `nil` ⇒ aucune requête distante possible (cas `.composerDraft`) :
        /// remplace les anciennes propriétés `contextId`/`contextType`, dont
        /// l'exhaustivité aurait exigé une valeur FACTICE pour ce cas.
        var remoteContext: (contextId: String, contextType: MentionContextType)? {
            switch self {
            case .conversation(let id): return (id, .conversation)
            case .post(let id): return (id, .post)
            case .composerDraft: return nil
            }
        }
    }

    // MARK: - Published State

    @Published public private(set) var suggestions: [MentionCandidate] = []
    @Published public private(set) var activeQuery: String? = nil
    @Published public private(set) var draftMentions: [String: MentionCandidate] = [:]

    /// **Une recherche est EN VOL.** Sans ce témoin, « aucune suggestion »
    /// couvre deux états qui n'ont pas la même réponse : « personne ne
    /// correspond » et « on n'a pas encore regardé ». Une bande qui les
    /// confond annonce « aucune personne trouvée » 300 ms avant d'avoir
    /// cherché, puis se dédit.
    @Published public private(set) var isResolving = false

    /// **LA règle de montage de la bande, écrite UNE fois.**
    ///
    /// Elle vivait recopiée sur les trois surfaces du composer sous la forme
    /// `activeQuery != nil && !suggestions.isEmpty`, chacune avec son
    /// doc-comment expliquant que « aucun appel réseau ne remplira la liste
    /// plus tard ». Cette justification est devenue FAUSSE le jour où un
    /// brouillon a pu interroger l'annuaire — et trois copies d'une règle se
    /// périment séparément.
    ///
    /// Ce qu'elle dit : on montre la bande dès qu'une requête `@` est active,
    /// SAUF pendant qu'une recherche est en vol et n'a encore rien rendu.
    /// Une bande vide n'est donc plus un silence : c'est la réponse
    /// « personne », que `ComposerMentionStrip` écrit en toutes lettres.
    public var showsSuggestions: Bool {
        activeQuery != nil && (!suggestions.isEmpty || !isResolving)
    }

    // MARK: - Private

    private let context: Context
    private let service: MentionServiceProviding
    private let directory: AudienceUserSearching
    private let currentUserId: String?
    private let localCandidates: () -> [MentionCandidate]
    private var debounceTask: Task<Void, Never>?

    // **Le seuil ne vit plus ici** (directive porteur 2026-09-05).
    //
    // Il valait `0` : l'appel contextuel partait dès le `@` NU, au motif que
    // « le backend renvoie auteur + commentateurs + contacts ». C'est vrai, et
    // ce n'est pas ce que la directive demande — sur `@` seul, ce sont les amis
    // et contacts LOCAUX qui répondent, sans réseau. La loi est
    // `MentionLookupRule` (SDK), partagée avec `MentionSuggestionsModel` :
    // deux familles de résolveurs portaient chacune son propre seuil, donc
    // trois régimes pour un même geste selon l'écran.
    private static let debounceMs: UInt64 = 300_000_000
    /// Même plafond que `MentionSuggestionsModel` (SDK), qui interroge le même
    /// annuaire : deux plafonds différents pour une même liste se seraient
    /// contredits à l'écran selon la surface qui pose la question.
    private static let directoryLimit = 20

    // MARK: - Init

    public init(
        context: Context,
        localCandidates: @escaping () -> [MentionCandidate] = { [] },
        service: MentionServiceProviding = MentionService.shared,
        directory: AudienceUserSearching = UserService.shared,
        currentUserId: String? = AuthManager.shared.currentUser?.id
    ) {
        self.context = context
        self.localCandidates = localCandidates
        self.service = service
        self.directory = directory
        self.currentUserId = currentUserId
    }

    // MARK: - Public API

    /// Called on every text change. Parses the trailing `@query` and
    /// updates `suggestions` / `activeQuery` with a 300ms debounce for API calls.
    public func handleQuery(in text: String) {
        guard let query = extractMentionQuery(from: text) else {
            clearSuggestions()
            return
        }
        activeQuery = query

        let locals = localCandidates()
        let filtered = filterLocals(locals, query: query)
        suggestions = filtered

        debounceTask?.cancel()

        // **Un brouillon cherche dans l'ANNUAIRE, pas seulement chez ses amis**
        // (#3904 → 2026-09-05). Le contexte manquant interdisait l'endpoint
        // CONTEXTUEL (`/mentions/suggestions` exige un post ou une
        // conversation) — et cette impossibilité, juste, avait été lue comme
        // « donc aucune recherche n'est possible ». Il en existait pourtant
        // une, employée par la surface mood du MÊME composer via
        // `MentionSuggestionList` : la recherche d'utilisateurs.
        //
        // Mesuré au simulateur `Meeshy-iOS26` : taper `@meeshy` dans le
        // document ne faisait apparaître AUCUNE rangée, tandis que le rendu du
        // post publié en faisait un lien cliquable. L'app affichait donc des
        // mentions qu'elle ne savait pas composer.
        guard let remoteContext = context.remoteContext else {
            scheduleDirectoryLookup(query: query, locals: filtered)
            return
        }
        guard MentionLookupRule.queriesRemote(query) else {
            isResolving = false
            return
        }

        isResolving = true
        debounceTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await Task.sleep(nanoseconds: Self.debounceMs)
                guard !Task.isCancelled else { return }
                let apiResults = try await service.suggestions(
                    contextId: remoteContext.contextId,
                    contextType: remoteContext.contextType,
                    query: query
                )
                guard !Task.isCancelled else { return }
                suggestions = mergeAPISuggestions(apiResults, localCandidates: filtered)
                isResolving = false
            } catch is CancellationError {
                // Attendu : une frappe plus récente a déjà repris le témoin à
                // son compte — le remettre à `false` ici l'éteindrait pour la
                // recherche SUIVANTE, qui vient de commencer.
            } catch {
                guard !Task.isCancelled else { return }
                isResolving = false
                Logger.messages.error("MentionComposerController: API suggestions failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// **La recherche d'un brouillon**, débattue comme celle du contexte et
    /// fusionnée derrière les amis déjà filtrés — qui restent EN TÊTE : une
    /// personne qu'on connaît se propose avant une homonyme qu'on ne connaît
    /// pas.
    ///
    /// **Sous deux caractères, rien ne part** (`MentionLookupRule`). Le `@` nu
    /// rendrait l'annuaire entier ; une seule lettre rend des dizaines de
    /// comptes sans rapport, et les pousse DEVANT les amis de l'auteur dans une
    /// bande qui n'en montre que trois. Dans ces deux cas les contacts locaux
    /// sont la réponse complète, et le témoin s'éteint tout de suite pour que
    /// la bande puisse dire « personne » quand il n'y en a aucun — l'état exact
    /// qu'un 404 sur la route des amis laissait passer pour un silence.
    private func scheduleDirectoryLookup(query: String, locals: [MentionCandidate]) {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard MentionLookupRule.queriesRemote(trimmed) else {
            isResolving = false
            return
        }

        isResolving = true
        debounceTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await Task.sleep(nanoseconds: Self.debounceMs)
                guard !Task.isCancelled else { return }
                let found = try await directory.searchUsers(
                    query: trimmed, limit: Self.directoryLimit, offset: 0)
                guard !Task.isCancelled else { return }
                suggestions = mergeDirectory(found, localCandidates: locals)
                isResolving = false
            } catch is CancellationError {
                // Idem ci-dessus : le témoin appartient déjà à la frappe suivante.
            } catch {
                guard !Task.isCancelled else { return }
                isResolving = false
                Logger.messages.error("MentionComposerController: directory search failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// Clears active suggestion state (called when `@` is no longer present in text).
    public func clearSuggestions() {
        debounceTask?.cancel()
        debounceTask = nil
        activeQuery = nil
        suggestions = []
        isResolving = false
    }

    /// Replaces the trailing `@query` in `text` with `@username ` and records the mention.
    /// Returns the updated text.
    @discardableResult
    public func insertMention(_ candidate: MentionCandidate, into text: String) -> String {
        let result = replaceMentionQuery(withUsername: candidate.username, in: text)
        draftMentions[candidate.username] = candidate
        clearSuggestions()
        return result
    }

    /// Clears all draft mention tracking (call after a successful send).
    public func clearDraft() {
        draftMentions = [:]
    }

    // MARK: - Private Helpers

    /// Extracts the current `@query` fragment at the end of the text cursor.
    /// Returns `nil` when no active mention is in progress.
    ///
    /// Délégué à la règle PURE du SDK (`ComposerMentionQuery`), partagée avec
    /// les composeurs de post et de story : la règle vivait ici en double, et
    /// cette copie-ci ouvrait une recherche sur « exemple.com » à chaque
    /// `contact@exemple.com` tapé — elle coupait sur le DERNIER `@` sans
    /// vérifier qu'il ouvre un handle.
    private func extractMentionQuery(from text: String) -> String? {
        ComposerMentionQuery.trailingHandle(in: text)
    }

    private func filterLocals(_ locals: [MentionCandidate], query: String) -> [MentionCandidate] {
        guard !query.isEmpty else { return locals }
        return locals.filter {
            $0.username.localizedCaseInsensitiveContains(query) ||
            $0.displayName.localizedCaseInsensitiveContains(query)
        }
    }

    /// Merges API `[MentionSuggestion]` into `[MentionCandidate]`, deduplicating against
    /// already-present local candidates (by username). API results come first.
    private func mergeAPISuggestions(
        _ api: [MentionSuggestion],
        localCandidates: [MentionCandidate]
    ) -> [MentionCandidate] {
        let localUsernames = Set(localCandidates.map(\.username))
        let fromAPI = api.map { s in
            MentionCandidate(
                id: s.id,
                username: s.username,
                displayName: s.displayName ?? s.username,
                avatarURL: s.avatar
            )
        }
        let newFromAPI = fromAPI.filter { !localUsernames.contains($0.username) }
        return localCandidates + newFromAPI
    }

    /// **La même fusion que celle de l'API contextuelle, sur l'autre source.**
    /// Les amis restent en tête, l'auteur ne se propose jamais lui-même, et un
    /// pseudo déjà servi ne revient pas en double — l'annuaire contient les
    /// amis, donc sans ce dédoublonnage chaque ami correspondant paraîtrait
    /// deux fois.
    private func mergeDirectory(
        _ found: [UserSearchResult],
        localCandidates: [MentionCandidate]
    ) -> [MentionCandidate] {
        let known = Set(localCandidates.map(\.username))
        let extras = found
            .filter { $0.id != currentUserId && !known.contains($0.username) }
            .map {
                MentionCandidate(
                    id: $0.id,
                    username: $0.username,
                    displayName: $0.displayName ?? $0.username,
                    avatarURL: $0.avatar
                )
            }
        return localCandidates + extras
    }

    /// Replaces the active `@query` fragment at the end of the text with the
    /// chosen handle. Même règle partagée que l'extraction — deux moitiés d'une
    /// même décision ne peuvent pas vivre à deux endroits différents.
    private func replaceMentionQuery(withUsername username: String, in text: String) -> String {
        ComposerMentionQuery.replacingTrailingHandle(in: text, with: username)
    }
}
