import Foundation
import Combine
import MeeshySDK

// MARK: - Quand la file se VIDE

// **Le déclenchement et le RÉESSAI d'un drain d'outbox.**
//
// Extrait d'`OutboxDispatcher.swift` le 2026-09-06 : ce fichier était à 1205
// lignes contre un plafond DUR de 1200, et la directive du 2026-08-28 dit
// d'EXTRAIRE avant d'ajouter — jamais de monter le plafond. C'est son second
// découpage, après `OutboxDispatcher+Messages.swift`.
//
// La coupe sépare deux questions qui n'ont rien à se dire : le dispatcher
// répond « QUOI envoyer, et à quelle adresse » — une ligne d'outbox décodée
// puis remise au bon service ; ces deux types répondent « QUAND vider la file,
// et que faire quand ça rate ». Le premier connaît les charges utiles, les
// seconds ne connaissent qu'un déclencheur et une horloge.
//
// > Un fichier qui grossit par accumulation de DTO et de politique mélange
// > deux durées de vie : les corps de requête suivent l'API, la politique de
// > réessai suit le réseau. Les séparer, c'est rendre chacun modifiable sans
// > relire l'autre.

/// Triggers an immediate outbox drain. `OutboxFlusher.flush()` otherwise
/// only runs at app boot (`MeeshyApp`) and on background→foreground
/// transitions (`BackgroundTransitionCoordinator`) — so an optimistic
/// mutation enqueued mid-session (a reaction in particular, which has no
/// other send path) would sit `pending` in the outbox until one of those
/// events and never reach the server. Call this right after enqueueing so
/// the change leaves the device immediately.
@MainActor
enum OutboxFlushTrigger {
    static func flushNow() async {
        let flusher = OutboxFlusher(
            pool: DependencyContainer.shared.dbPool,
            dispatcher: OutboxDispatcher(),
            onOutcome: { @Sendable outcome in
                Task { await OfflineQueue.shared.publishOutcome(outcome) }
            },
            isNetworkReachable: { @Sendable in
                await MainActor.run { NetworkConditionMonitor.shared.isOnline }
            }
        )
        let nextRetry = await flusher.flush()
        OutboxRetryScheduler.shared.schedule(at: nextRetry)
    }
}

/// Possède l'unique timer de re-flush de l'outbox.
///
/// `OutboxFlusher` repousse `nextAttemptAt` sur échec (backoff exponentiel)
/// mais ne se rappelle jamais lui-même : sans ce planificateur, un record en
/// backoff attendait le prochain évènement de cycle de vie (boot, retour au
/// premier plan, enqueue, BGTask) pour être retenté. Ici, dès qu'un flush
/// laisse un record différé, on (ré)arme un timer unique qui rejoue le flush
/// pile à l'échéance. Le timer est dédupliqué : `schedule` annule toujours le
/// précédent, il n'y a donc jamais plus d'un timer en vol.
@MainActor
final class OutboxRetryScheduler {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = OutboxRetryScheduler()
    private var timer: Task<Void, Never>?
    private var networkCancellable: AnyCancellable?
    private var mutationCancellable: AnyCancellable?
    private init() {}

    /// Réveille le flusher à chaque transition réseau offline→online.
    ///
    /// `OutboxFlusher.flush()` est bandwidth-gated : une mutation enqueueée
    /// hors-ligne court-circuite, et comme rien n'est différé, AUCUN timer de
    /// backoff n'est armé (`schedule(at: nil)` annule le précédent). Sans ce
    /// trigger, elle resterait `pending` jusqu'à un évènement de cycle de vie
    /// incident (boot / retour au premier plan). On s'abonne à la MÊME source
    /// d'état réseau que le gate du flusher (`NetworkConditionMonitor`) pour
    /// garantir que trigger et gate s'accordent. Publisher + flush injectés
    /// pour la testabilité ; à appeler une fois au démarrage de l'app.
    func startObservingNetworkReconnect(
        conditionPublisher: AnyPublisher<NetworkCondition, Never> = NetworkConditionMonitor.shared.$condition.eraseToAnyPublisher(),
        flush: @escaping @MainActor () async -> Void = { await OutboxFlushTrigger.flushNow() }
    ) {
        networkCancellable = conditionPublisher
            .map { $0 != .offline }
            .removeDuplicates()
            .dropFirst()            // ignore la valeur courante rejouée à l'abonnement
            .filter { $0 }          // uniquement offline→online
            .sink { _ in Task { @MainActor in await flush() } }
    }

    /// outbox-04 — réveille le flusher juste après une mutation sociale
    /// enfilée EN LIGNE (like/post/commentaire) : sans ce trigger la row
    /// reste `.pending` jusqu'au prochain événement de cycle de vie incident
    /// (reconnect, boot, foreground). Débounce 250 ms : une rafale (double-tap
    /// like, commentaires d'affilée) ne déclenche qu'un seul flush groupé.
    /// Publisher + flush injectés pour la testabilité — même pattern que
    /// `startObservingNetworkReconnect`.
    func startObservingMutationEnqueued(
        mutationPublisher: AnyPublisher<Void, Never> = OfflineQueue.shared.mutationEnqueued.publisher,
        flush: @escaping @MainActor () async -> Void = { await OutboxFlushTrigger.flushNow() }
    ) {
        mutationCancellable = mutationPublisher
            .debounce(for: .milliseconds(250), scheduler: DispatchQueue.main)
            .sink { _ in Task { @MainActor in await flush() } }
    }

    /// (Ré)arme le timer pour rejouer un flush à `date`. `nil` annule le
    /// timer en attente (plus rien n'est différé).
    func schedule(at date: Date?) {
        timer?.cancel()
        guard let date else {
            timer = nil
            return
        }
        timer = Task {
            // Cap à 1 h : au-delà, un évènement de cycle de vie aura de toute
            // façon redéclenché un flush entre-temps.
            let delay = min(max(0, date.timeIntervalSinceNow), 3600)
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            await OutboxFlushTrigger.flushNow()
        }
    }
}

/// Corps de `POST /posts` tel que la file durable l'émet — hissé au niveau du
/// fichier pour être encodable en test, comme `UpdateProfileFieldsBody`.
/// `attachmentIds` devient `mediaIds` au passage du fil, pour épouser le nom
/// du champ côté gateway.
/// `nonisolated` : l'app compile sous `defaultIsolation(MainActor)`, et une
/// conformance `Encodable` isolée ne peut pas servir depuis le dispatch, qui
/// hérite de l'isolation de son appelant.
/// **La traduction des LÉGENDES, de la position d'origine vers l'id serveur**
/// (#4756).
///
/// Les deux identités ne coexistent qu'à cet étage : la légende est composée
/// quand le fichier n'a qu'une position, et servie quand il n'a plus qu'un id.
/// Écrire cette carte plus tôt aurait produit une charge dont aucune clé
/// n'existe chez le destinataire — et `PostService.applyMediaText` filtre en
/// SILENCE ce qu'il ne reconnaît pas.
///
/// Une position dont l'upload a ÉCHOUÉ n'a pas d'entrée : sa légende est
/// OMISE plutôt que posée sur le voisin. C'est la même règle que
/// `StoryMediaTextMapping.serverKeyed` applique sur l'autre voie — un texte
/// sans destinataire ne s'invente pas un porteur.
///
/// Une légende vide ou blanche est omise aussi : une clé présente à valeur vide
/// poserait une légende BLANCHE sur le média, le contraire de « pas de
/// légende » (`ComposerSlideTextRole.applyCaption`, même distinction).
/// **La traduction « position d'origine → id serveur », pour TOUT texte par
/// média.**
///
/// Elle s'appelait `serverKeyedCaptions` et ne servait qu'aux légendes. Le nom
/// disait le premier appelant, jamais la règle — et le second appelant (le
/// texte alternatif, 2026-09-05) aurait eu le choix entre appeler une fonction
/// qui prétend faire autre chose, ou en écrire une jumelle. Les deux réponses
/// sont mauvaises ; renommer coûte une ligne.
///
/// > Un nom qui décrit l'APPELANT plutôt que la règle fabrique une jumelle au
/// > deuxième usage.
nonisolated func serverKeyedTexts(
    _ byIndex: [String?]?,
    idsBySourceIndex: [Int: String]
) -> [String: String] {
    guard let byIndex else { return [:] }
    return byIndex.enumerated().reduce(into: [String: String]()) { keyed, entree in
        let (index, texte) = entree
        guard let texte, !texte.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let id = idsBySourceIndex[index] else { return }
        keyed[id] = texte
    }
}
