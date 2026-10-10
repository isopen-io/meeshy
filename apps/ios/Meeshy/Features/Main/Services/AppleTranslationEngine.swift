import Combine
import Foundation
import MeeshySDK
import os
import SwiftUI
@preconcurrency import Translation

// MARK: - Le moteur Apple Translation (#9899) — iOS 18 et plus
//
// `TranslationSession` n'existe QUE dans le corps d'un `.translationTask`, posé
// sur une vue vivante : il n'y a pas de session à obtenir d'un service. Le
// moteur est donc fait de deux moitiés qui se parlent par une FILE de travaux :
//
// - `AppleTranslationEngine` (cet objet) reçoit les demandes du coordinateur,
//   les met en file, et expose la `configuration` du travail en cours ;
// - `AppleTranslationHost` (une vue de 1 pt, montée avec la conversation) donne
//   cette configuration à `.translationTask`. Quand le système lui rend une
//   session, il appelle `serve`, qui prend le travail, traduit, et rend.
//
// La file est SÉRIE : un travail à la fois, une session par travail. Pour un
// second travail du même couple, `invalidate()` rejoue la tâche ; pour un autre
// couple, une configuration neuve la remplace. `epoch` change à chaque
// configuration émise : une tâche de l'hôte qui se réveille après coup (vue
// remontée, ancienne configuration) ne prend jamais le travail d'une autre.
//
// Couples de langues. Les codes du prisme sont ceux de Meeshy — deux lettres,
// région-aveugles (`pt`, `en`, `zh`). Apple ne prend en charge que des
// variantes (`pt-BR`, `en-US`, `zh-Hans`) : `resolve` essaie d'abord le code nu,
// puis chaque variante que `supportedLanguages` annonce pour la même langue, et
// garde la première qui n'est pas `.unsupported` (installée de préférence).
// Pour `zh`, c'est donc la première variante de la liste d'Apple — sans
// connaître l'écriture du texte, le moteur ne peut pas mieux. Le choix se lit
// dans `Resolution`.
//
// Téléchargement. Un couple `.supported` dont les modèles ne sont pas sur
// l'appareil fait apparaître la feuille de téléchargement du système au premier
// travail (`prepareTranslation`). Un échec de ce travail — refus, hors ligne —
// est RETENU pour toute la session d'app : la feuille ne revient pas, et le
// couple est déclaré non pris en charge. Jamais deux feuilles pour un couple.

@available(iOS 18.0, *)
@MainActor
final class AppleTranslationEngine: ObservableObject, DeviceTranslationEngineProviding {
    nonisolated deinit {}

    let engineName = "apple-translation"

    /// Donnée à `.translationTask` par l'hôte. `nil` tant qu'aucun travail n'a
    /// été émis, et après `cancelPending()`.
    @Published private(set) var configuration: TranslationSession.Configuration?

    /// Change à chaque configuration émise — voir l'en-tête du fichier.
    private(set) var epoch = 0

    /// Le temps que l'hôte a pour prendre un travail émis. Au-delà, la vue n'est
    /// pas à l'écran : le travail rend vide, et le coordinateur n'insiste pas.
    private static let claimTimeout: Duration = .seconds(10)

    /// Les couples dont le téléchargement a échoué ou a été refusé, pour toute
    /// la session d'app — partagé entre les conversations, qui ont chacune leur
    /// moteur.
    private static var declinedDownloads: Set<DeviceTranslationPair> = []

    private var queue: [Job] = []
    private var resolved: [DeviceTranslationPair: Resolution] = [:]
    private var unsupported: Set<DeviceTranslationPair> = []
    private var watchdog: Task<Void, Never>?

    // MARK: - DeviceTranslationEngineProviding

    func availability(of pair: DeviceTranslationPair) async -> DeviceTranslationAvailability {
        if Self.declinedDownloads.contains(pair) || unsupported.contains(pair) { return .unsupported }
        if let known = resolved[pair], known.availability == .ready { return .ready }
        guard let resolution = await resolve(pair) else {
            unsupported.insert(pair)
            return .unsupported
        }
        resolved[pair] = resolution
        return resolution.availability
    }

    func translate(
        _ requests: [DeviceTranslationRequest],
        pair: DeviceTranslationPair
    ) async -> [DeviceTranslationResult] {
        guard !requests.isEmpty, !Task.isCancelled, let resolution = resolved[pair] else { return [] }
        return await withCheckedContinuation { (continuation: CheckedContinuation<[DeviceTranslationResult], Never>) in
            queue.append(Job(requests: requests, pair: pair, resolution: resolution, continuation: continuation))
            startNextJobIfIdle()
        }
    }

    func cancelPending() {
        watchdog?.cancel()
        watchdog = nil
        let pending = queue
        queue.removeAll()
        epoch += 1
        configuration = nil
        for job in pending { job.continuation?.resume(returning: []) }
    }

    // MARK: - Le côté de l'hôte

    /// Appelée par `AppleTranslationHost` quand `.translationTask` rend une
    /// session. Prend le travail émis, le traduit avec cette session, le rend.
    /// Sans travail à prendre — tâche en retard, vue remontée — elle ne fait rien.
    nonisolated func serve(_ session: TranslationSession, epoch issuedEpoch: Int) async {
        guard let job = await claimJob(epoch: issuedEpoch) else { return }
        let results = await Self.perform(job, with: session)
        await complete(
            jobId: job.id,
            results: results ?? [],
            declinedDownload: results == nil && job.needsDownload
        )
    }

    private nonisolated static func perform(
        _ job: ClaimedJob,
        with session: TranslationSession
    ) async -> [DeviceTranslationResult]? {
        // Une session dont la vue a disparu ne se touche plus (le framework
        // l'arrête net) : la tâche de l'hôte est alors annulée, et on le lit
        // AVANT chaque appel. Une annulation n'est pas un refus de téléchargement.
        do {
            try Task.checkCancellation()
            if job.needsDownload { try await session.prepareTranslation() }
            try Task.checkCancellation()
            let batch = job.requests.map {
                TranslationSession.Request(sourceText: $0.text, clientIdentifier: $0.id)
            }
            let responses = try await session.translations(from: batch)
            return responses.compactMap { response in
                response.clientIdentifier.map { DeviceTranslationResult(id: $0, text: response.targetText) }
            }
        } catch is CancellationError {
            return []
        } catch {
            Logger.deviceTranslation.info("apple translation failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private func claimJob(epoch issuedEpoch: Int) -> ClaimedJob? {
        guard issuedEpoch == epoch, let job = queue.first, job.phase == .issued else { return nil }
        queue[0].phase = .running
        watchdog?.cancel()
        watchdog = nil
        return ClaimedJob(id: job.id, requests: job.requests, needsDownload: job.resolution.availability == .needsDownload)
    }

    private func complete(jobId: UUID, results: [DeviceTranslationResult], declinedDownload: Bool) {
        guard let index = queue.firstIndex(where: { $0.id == jobId }) else { return }
        let job = queue.remove(at: index)
        if declinedDownload {
            Self.declinedDownloads.insert(job.pair)
        } else if job.resolution.availability == .needsDownload, !results.isEmpty {
            resolved[job.pair] = Resolution(
                source: job.resolution.source, target: job.resolution.target, availability: .ready
            )
        }
        job.continuation?.resume(returning: results)
        startNextJobIfIdle()
    }

    // MARK: - La file

    private func startNextJobIfIdle() {
        while let job = queue.first, job.phase == .queued {
            if Self.declinedDownloads.contains(job.pair) {
                queue.removeFirst()
                job.continuation?.resume(returning: [])
                continue
            }
            queue[0].phase = .issued
            issueConfiguration(for: job.resolution)
            armWatchdog(for: job.id)
            return
        }
    }

    private func issueConfiguration(for resolution: Resolution) {
        epoch += 1
        guard var current = configuration,
              current.source == resolution.source,
              current.target == resolution.target
        else {
            configuration = TranslationSession.Configuration(source: resolution.source, target: resolution.target)
            return
        }
        current.invalidate()
        configuration = current
    }

    private func armWatchdog(for jobId: UUID) {
        watchdog?.cancel()
        watchdog = Task { [weak self] in
            try? await Task.sleep(for: Self.claimTimeout)
            guard !Task.isCancelled else { return }
            self?.expire(jobId)
        }
    }

    private func expire(_ jobId: UUID) {
        guard let job = queue.first(where: { $0.id == jobId }), job.phase == .issued else { return }
        Logger.deviceTranslation.info("apple translation host never started its session")
        complete(jobId: jobId, results: [], declinedDownload: false)
    }

    // MARK: - Les couples de langues

    private func resolve(_ pair: DeviceTranslationPair) async -> Resolution? {
        let availability = LanguageAvailability()
        let supported = await availability.supportedLanguages
        var download: Resolution?
        for source in Self.variants(of: pair.source, among: supported) {
            for target in Self.variants(of: pair.target, among: supported) {
                switch await availability.status(from: source, to: target) {
                case .installed:
                    return Resolution(source: source, target: target, availability: .ready)
                case .supported:
                    download = download ?? Resolution(source: source, target: target, availability: .needsDownload)
                case .unsupported:
                    continue
                @unknown default:
                    continue
                }
            }
        }
        return download
    }

    /// Le code nu d'abord, puis les variantes que le système annonce pour la même
    /// langue (`pt` → `pt-BR`).
    private static func variants(of code: String, among supported: [Locale.Language]) -> [Locale.Language] {
        let plain = Locale.Language(identifier: code)
        return [plain] + supported.filter { $0.languageCode == plain.languageCode && $0 != plain }
    }

    // MARK: - Les types de la file

    private struct Resolution {
        let source: Locale.Language
        let target: Locale.Language
        let availability: DeviceTranslationAvailability
    }

    private struct Job {
        enum Phase { case queued, issued, running }

        let id = UUID()
        let requests: [DeviceTranslationRequest]
        let pair: DeviceTranslationPair
        let resolution: Resolution
        var phase = Phase.queued
        var continuation: CheckedContinuation<[DeviceTranslationResult], Never>?

        init(
            requests: [DeviceTranslationRequest],
            pair: DeviceTranslationPair,
            resolution: Resolution,
            continuation: CheckedContinuation<[DeviceTranslationResult], Never>
        ) {
            self.requests = requests
            self.pair = pair
            self.resolution = resolution
            self.continuation = continuation
        }
    }
}

/// Ce que `serve` emporte hors du main actor : de quoi traduire, rien de plus.
private nonisolated struct ClaimedJob: Sendable {
    let id: UUID
    let requests: [DeviceTranslationRequest]
    let needsDownload: Bool
}

// MARK: - L'hôte

/// La vue de 1 pt qui donne sa configuration à `.translationTask`. Montée une
/// fois par conversation ouverte (`ConversationDeviceTranslationLayer`) ; elle ne
/// peint rien, ne prend aucun toucher et n'existe pas pour VoiceOver.
@available(iOS 18.0, *)
struct AppleTranslationHost: View {
    @ObservedObject var engine: AppleTranslationEngine

    var body: some View {
        let driver = engine
        let issued = engine.epoch
        Color.clear
            .frame(width: 1, height: 1)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .translationTask(engine.configuration) { session in
                await driver.serve(session, epoch: issued)
            }
    }
}

private extension Logger {
    nonisolated static let deviceTranslation = Logger(subsystem: "me.meeshy.app", category: "device-translation")
}
