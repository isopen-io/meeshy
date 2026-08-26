import Foundation
import SwiftUI
import Combine
import MeeshySDK

/// État de la « page du son » : ce qui a été publié avec lui.
///
/// C'est la surface qui rend la bibliothèque découvrable — sans elle, un son ne
/// se juge que sur son titre et deux compteurs. Elle rend aussi ces compteurs
/// VÉRIFIABLES : ils décrivent exactement la population listée ici, si bien
/// qu'un lecteur qui doute peut recompter.
@MainActor
public final class SoundDetailModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published public private(set) var posts: [APISoundPost] = []
    @Published public private(set) var isLoading = false
    @Published public private(set) var didFail = false

    private let service: SoundLibraryServiceProviding
    private let soundId: String
    private var nextCursor: Date?
    private var loadedOnce = false
    /// Pages consécutives revenues sans AUCUNE nouvelle publication. Le curseur
    /// suit les usages, pas les publications : plusieurs usages désignent
    /// parfois la même publication, et les non publiques sont écartées. Une
    /// page vide n'est donc pas la fin — s'arrêter au premier vide
    /// tronquerait la liste.
    private var emptyStreak = 0
    private static let emptyStreakLimit = 3

    public init(soundId: String, service: SoundLibraryServiceProviding = SoundLibraryService.shared) {
        self.soundId = soundId
        self.service = service
    }

    public var canLoadMore: Bool { nextCursor != nil && !isLoading }

    public var isEmpty: Bool { posts.isEmpty && !isLoading }

    public func loadIfNeeded() async {
        guard !loadedOnce else { return }
        loadedOnce = true
        await load(reset: true)
    }

    public func loadMore() async {
        guard nextCursor != nil, !isLoading else { return }
        await load(reset: false)
    }

    private func load(reset: Bool) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let page = try await service.posts(soundId: soundId, cursor: reset ? nil : nextCursor, limit: 24)
            didFail = false

            // Dédoublonnage OBLIGATOIRE : une publication qui pose le son sur
            // plusieurs pistes revient une fois par usage, et la grille
            // afficherait la même vignette deux ou trois fois.
            let known = Set(posts.map(\.id))
            let fresh = page.posts.filter { !known.contains($0.id) }

            if reset { posts = page.posts } else { posts.append(contentsOf: fresh) }
            nextCursor = page.nextCursor
            emptyStreak = fresh.isEmpty && !reset ? emptyStreak + 1 : 0
            // Après plusieurs pages sans rien de neuf, on arrête : le serveur
            // pagine des usages qui ne produisent plus de publication visible,
            // et poursuivre ferait tourner une roue sans fin.
            if emptyStreak >= Self.emptyStreakLimit { nextCursor = nil }
        } catch {
            // La liste déjà affichée est conservée : une page manquante ne doit
            // pas effacer ce que l'utilisateur regarde.
            didFail = posts.isEmpty
            nextCursor = nil
        }
    }
}
