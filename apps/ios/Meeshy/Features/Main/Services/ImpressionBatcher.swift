import Foundation
import Combine
import MeeshySDK
import os
#if canImport(UIKit)
import UIKit
#endif

/// Groupe les impressions d'une surface et garantit qu'aucune n'est perdue.
///
/// Une impression est comptée par APPARITION à l'écran : contrairement à
/// l'ancienne déduplication de session, une occurrence perdue ne se rattrape
/// pas à la prochaine apparition — elle est simplement absente du compteur.
/// Or les lots vivaient dans un `Task` local à chaque vue, et disparaissaient
/// dans trois cas : sortie d'écran (`FeedView.onDisappear` annulait même le
/// task explicitement), passage en arrière-plan, fermeture de l'app.
///
/// Trois filets, du plus fréquent au plus rare :
/// 1. `flushNow()` à la sortie d'écran (appelé par la vue),
/// 2. flush automatique sur `willResignActive` / `didEnterBackground`,
/// 3. persistance des occurrences en attente à chaque `record`, rejouées au
///    lancement suivant — le seul filet qui couvre une app tuée dans la
///    fenêtre de groupement.
///
/// L'`OfflineQueue` n'est délibérément PAS utilisée : elle rejoue avec un
/// `clientMutationId` que le gateway déduplique, ce qui écraserait justement
/// les occurrences répétées qu'on cherche à préserver.
/// `ObservableObject` uniquement pour pouvoir être tenu par un `@StateObject`
/// (durée de vie alignée sur la vue). Aucune propriété `@Published` : le
/// comptage de portée ne doit jamais provoquer de re-render.
@MainActor
final class ImpressionBatcher: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "impressions")

    /// outbox-11 — préfixe partagé des clés de persistance (une par surface).
    static let storageKeyPrefix = "meeshy.impressions.pending."

    private let source: String
    private let postService: PostServiceProviding
    private let flushDelay: TimeInterval
    private let defaults: UserDefaults
    private let storageKey: String

    private var pending: [String] = []
    private var flushTask: Task<Void, Never>?
    /// Combine plutôt que des tokens `NotificationCenter` : ceux-ci exigeraient
    /// un `deinit` qui touche l'état isolé, ce que Swift 6 refuse (et qu'un
    /// `deinit` isolé ferait payer d'un double-free sur iOS < 26). Les
    /// souscriptions se résilient seules à la libération.
    private var cancellables = Set<AnyCancellable>()

    init(
        source: String,
        postService: PostServiceProviding = PostService.shared,
        flushDelay: TimeInterval = 3,
        defaults: UserDefaults = .standard
    ) {
        self.source = source
        self.postService = postService
        self.flushDelay = flushDelay
        self.defaults = defaults
        self.storageKey = Self.storageKeyPrefix + source
        self.pending = defaults.stringArray(forKey: storageKey) ?? []
        subscribeToAppLifecycle()
        // Rejeu de ce qu'une session tuée a laissé en attente. Sans ce
        // déclenchement, le lot ne repartait qu'à la faveur d'une NOUVELLE
        // apparition — donc jamais si la surface n'affiche plus rien.
        if !pending.isEmpty { scheduleFlush() }
    }

    /// Le post `postId` vient d'apparaître à l'écran.
    func record(_ postId: String) {
        guard !postId.isEmpty else { return }
        pending.append(postId)
        persist()
        scheduleFlush()
    }

    /// Envoie immédiatement ce qui est en attente. À appeler quand la surface
    /// disparaît — sans quoi le lot en cours de groupement est perdu.
    func flushNow() async {
        flushTask?.cancel()
        flushTask = nil
        await flush()
    }

    // MARK: - Interne

    private func scheduleFlush() {
        flushTask?.cancel()
        flushTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(nanoseconds: UInt64(self.flushDelay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await self.flush()
        }
    }

    private func flush() async {
        let batch = pending
        guard !batch.isEmpty else { return }
        // Vidé AVANT l'appel pour qu'une apparition concurrente ne reparte pas
        // dans le lot suivant en double ; réinséré en tête si l'envoi échoue.
        pending.removeAll()
        persist()
        do {
            try await postService.recordImpressions(postIds: batch, source: source)
        } catch {
            pending.insert(contentsOf: batch, at: 0)
            persist()
            Self.logger.debug("impression flush failed (kept for retry): \(error.localizedDescription, privacy: .public)")
        }
    }

    private func persist() {
        defaults.set(pending, forKey: storageKey)
    }

    // MARK: - Logout purge (outbox-11)

    /// Les lots d'impressions persistés (UserDefaults standard, clés sans
    /// userId) sont rejoués dès l'init de chaque surface : sans purge au
    /// logout, les impressions du compte A partent sous le token du compte B.
    static func purgeAllPendingImpressions(in defaults: UserDefaults = .standard) {
        defaults.dictionaryRepresentation().keys
            .filter { $0.hasPrefix(storageKeyPrefix) }
            .forEach { defaults.removeObject(forKey: $0) }
    }

    private func subscribeToAppLifecycle() {
        #if canImport(UIKit)
        // `willResignActive` couvre les hand-offs brefs (centre de contrôle,
        // appel entrant), `didEnterBackground` le passage en arrière-plan
        // complet — le second ne suit pas toujours le premier.
        for name in [UIApplication.willResignActiveNotification,
                     UIApplication.didEnterBackgroundNotification] {
            NotificationCenter.default.publisher(for: name)
                .sink { [weak self] _ in
                    Task { @MainActor in await self?.flushNow() }
                }
                .store(in: &cancellables)
        }
        #endif
    }
}
