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
    /// #10483 — OÙ le contenu est apparu. Tout lot part par la porte unique
    /// `POST /social/events`, avec ou sans surface (clé absente du fil) ;
    /// présente, la file a sa propre clé : deux surfaces d'une même source ne
    /// s'écrasent plus.
    private let surface: ReachSurface?
    private let postService: PostServiceProviding
    private let flushDelay: TimeInterval
    private let defaults: UserDefaults
    /// Le compte sous lequel une impression est VUE. La file appartient à ce
    /// compte, sur le disque comme en mémoire : une impression du compte A ne
    /// part jamais sous le JWT du compte B, même pour les files partagées
    /// (`SharedImpressionBatchers`) qui survivent à la déconnexion.
    private let accountId: @MainActor () -> String?

    private var pending: [String] = []
    private var pendingAccount: String?
    private var flushTask: Task<Void, Never>?
    /// Combine plutôt que des tokens `NotificationCenter` : ceux-ci exigeraient
    /// un `deinit` qui touche l'état isolé, ce que Swift 6 refuse (et qu'un
    /// `deinit` isolé ferait payer d'un double-free sur iOS < 26). Les
    /// souscriptions se résilient seules à la libération.
    private var cancellables = Set<AnyCancellable>()

    init(
        source: String,
        surface: ReachSurface? = nil,
        postService: PostServiceProviding = PostService.shared,
        flushDelay: TimeInterval = 3,
        defaults: UserDefaults = .standard,
        accountId: @escaping @MainActor () -> String? = { AuthManager.shared.currentUser?.id }
    ) {
        self.source = source
        self.surface = surface
        self.postService = postService
        self.flushDelay = flushDelay
        self.defaults = defaults
        self.accountId = accountId
        let account = accountId()
        self.pendingAccount = account
        self.pending = defaults.stringArray(
            forKey: Self.storageKey(source: source, surface: surface, accountId: account)
        ) ?? []
        subscribeToAppLifecycle()
        // Rejeu de ce qu'une session tuée a laissé en attente. Sans ce
        // déclenchement, le lot ne repartait qu'à la faveur d'une NOUVELLE
        // apparition — donc jamais si la surface n'affiche plus rien.
        if !pending.isEmpty { scheduleFlush() }
    }

    /// Le post `postId` vient d'apparaître à l'écran.
    func record(_ postId: String) {
        guard !postId.isEmpty else { return }
        adoptCurrentAccount()
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
        adoptCurrentAccount()
        let batch = pending
        guard !batch.isEmpty else { return }
        // Vidé AVANT l'appel pour qu'une apparition concurrente ne reparte pas
        // dans le lot suivant en double ; réinséré en tête si l'envoi échoue.
        pending.removeAll()
        persist()
        let owner = pendingAccount
        do {
            try await send(batch)
        } catch let unsent as UnsentImpressions {
            keepForRetry(unsent.postIds, owner: owner)
            Self.logger.debug("impression flush partially failed (rest kept for retry): \(unsent.cause.localizedDescription, privacy: .public)")
        } catch {
            keepForRetry(batch, owner: owner)
            Self.logger.debug("impression flush failed (kept for retry): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Un échec revient dans la file de SON compte — si le compte a changé
    /// pendant l'envoi, sur le disque de celui-ci, pas dans la file courante.
    private func keepForRetry(_ postIds: [String], owner: String?) {
        guard owner == pendingAccount else {
            let key = Self.storageKey(source: source, surface: surface, accountId: owner)
            defaults.set(postIds + (defaults.stringArray(forKey: key) ?? []), forKey: key)
            return
        }
        pending.insert(contentsOf: postIds, at: 0)
        persist()
    }

    /// La clé d'une surface prolonge celle de sa source : une file sans
    /// surface garde la clé qu'elle avait avant #10483.
    static func storageKey(source: String, surface: ReachSurface?) -> String {
        storageKeyPrefix + source + (surface.map { ".\($0.rawValue)" } ?? "")
    }

    /// La clé d'une file appartient à un compte ; sans compte, la clé historique.
    static func storageKey(source: String, surface: ReachSurface?, accountId: String?) -> String {
        storageKey(source: source, surface: surface) + (accountId.map { "@\($0)" } ?? "")
    }

    /// Le compte a changé depuis la dernière écriture : la file en mémoire
    /// appartient à l'autre compte (elle reste sur SON disque, ou a été purgée
    /// à sa déconnexion) et cède la place à celle du compte courant.
    private func adoptCurrentAccount() {
        let account = accountId()
        guard account != pendingAccount else { return }
        pendingAccount = account
        pending = defaults.stringArray(forKey: currentStorageKey) ?? []
    }

    private var currentStorageKey: String {
        Self.storageKey(source: source, surface: surface, accountId: pendingAccount)
    }

    /// Le plafond d'un lot de `POST /social/events`.
    static let socialEventsCap = 200

    private func send(_ batch: [String]) async throws {
        for start in stride(from: 0, to: batch.count, by: Self.socialEventsCap) {
            let chunk = batch[start..<min(start + Self.socialEventsCap, batch.count)]
            do {
                _ = try await postService.recordSocialEvents(
                    chunk.map { SocialEvent.impression(postId: $0, source: source, surface: surface) },
                    credential: .account
                )
            } catch let error where Self.isPermanentRejection(error) {
                Self.logger.error("impression chunk rejected (dropped \(chunk.count, privacy: .public)): \(error.localizedDescription, privacy: .public)")
            } catch {
                throw UnsentImpressions(postIds: Array(batch[start...]), cause: error)
            }
        }
    }

    /// Un refus que le rejeu ne changera jamais : un 4xx hors 408/429 (le
    /// paquet lui-même est invalide), ou une réponse 2xx illisible (le serveur
    /// a déjà compté — rejouer compterait deux fois). Le réseau, les 5xx, les
    /// 429 et l'expiration de session restent rejouables (#10398).
    nonisolated static func isPermanentRejection(_ error: Error) -> Bool {
        guard let apiError = error as? APIError else { return false }
        switch apiError {
        case .serverError(let code, _):
            return (400..<500).contains(code) && code != 408 && code != 429
        case .decodingError:
            return true
        default:
            return false
        }
    }

    /// Les paquets déjà acceptés ne repartent pas : seul le reste revient en file.
    nonisolated private struct UnsentImpressions: Error {
        let postIds: [String]
        let cause: Error
    }

    private func persist() {
        defaults.set(pending, forKey: currentStorageKey)
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
