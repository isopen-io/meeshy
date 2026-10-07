import SwiftUI
import UIKit
import MeeshySDK
import os

// MARK: - La capture d'un contenu qui disparaît s'annonce au fil (#9617)

/// **Une surface qui MONTRE des messages et sait lesquels sont à l'écran.**
///
/// Chaque surface réutilise SA preuve d'affichage — aucun registre de
/// visibilité de plus : le fil (Bulles, Focal, Script) lit ses cellules
/// visibles (`indexPathsForVisibleItems`, la même source que les accusés de
/// lecture), la Rivière les cadres mesurés de ses bulles, la galerie sa page
/// courante. Le rapporteur ne les interroge qu'à l'instant d'une capture, et
/// une fois par seconde pendant un enregistrement.
@MainActor
protocol ContentCaptureSource: AnyObject {
    /// Un plein écran présenté PAR-DESSUS la conversation : quand elle est
    /// couverte, seules ces surfaces comptent — le fil dessous n'est pas vu.
    var isCaptureCover: Bool { get }
    func visibleCaptureCandidates() -> [ContentCaptureCandidate]
    /// La passerelle n'annonce qu'un message LU par l'acteur (`readAt`) ou
    /// une vue unique ouverte : à l'instant d'une capture, la surface pose
    /// l'accusé de lecture de ce qu'elle montre, avant la déclaration.
    func acknowledgeVisibleReads()
}

extension ContentCaptureSource {
    func acknowledgeVisibleReads() {}
}

// MARK: - Une surface ANNONCE-t-elle ? (fermé par défaut)

/// **Un contenu qui disparaît est soit ANNONCÉ, soit NOIR — jamais capturé en
/// silence.** Seules les surfaces ENREGISTRÉES auprès du rapporteur (le fil,
/// la Rivière, le plein écran de la conversation) posent cette valeur ; sous
/// elles, une flamme quitte la couche sécurisée parce que sa capture sera
/// annoncée. Partout ailleurs — feuille « Plus », épinglés, fil de
/// discussion, aperçu de transfert, réponse en cours, aperçu d'appui long,
/// liste des conversations — la valeur par défaut tient : la flamme reste
/// noire (`CaptureVerdict.shieldsCapture`).
private struct AnnouncesCaptureKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var announcesCapture: Bool {
        get { self[AnnouncesCaptureKey.self] }
        set { self[AnnouncesCaptureKey.self] = newValue }
    }
}

extension View {
    /// À poser SEULEMENT par une surface enregistrée auprès de
    /// `ContentCaptureReporter` — garde : `CaptureShieldCoverageGuardTests`.
    func announcesCaptures() -> some View {
        environment(\.announcesCapture, true)
    }
}

/// Ce qu'une rangée de message MONTRE et qui se déclare.
nonisolated enum ContentCaptureVisibility {

    /// Le message lui-même, s'il n'est pas un avis ni supprimé — et une vue
    /// unique seulement RÉVÉLÉE sur place : une bulle scellée ne montre rien,
    /// et la capture de l'écran qui la porte n'est pas une tentative. Plus la
    /// citation qu'il porte, qui montre le texte ou la vignette de son cité.
    static func candidates(for message: Message, serverId: String?) -> [ContentCaptureCandidate] {
        guard message.messageSource != .system, !message.isDeleted else { return [] }
        let own: [ContentCaptureCandidate] = {
            let law = message.contentExitLaw
            guard law.nature != .viewOnce || message.isViewOnceRevealed else { return [] }
            return [ContentCaptureCandidate(
                conversationId: message.conversationId,
                messageId: serverId ?? message.id,
                capture: message.exitOffer.capture,
                isMine: message.isMe
            )]
        }()
        guard let reply = message.replyTo, !reply.messageId.isEmpty, !reply.isQuotedMessageDeleted else { return own }
        // Une citation dont la nature n'est pas DÉCLARÉE peut être celle d'une
        // flamme après lecture pas encore consommée (ni échéance, ni drapeau) :
        // elle se déclare quand même — la passerelle juge sur le cité réel, et
        // un cité ordinaire ne produit aucun avis.
        let verdict = reply.quotedCapture(quotedMessage: nil)
        let quoted = ContentCaptureCandidate(
            conversationId: message.conversationId,
            messageId: reply.messageId,
            capture: verdict == .free && reply.quotedExitNature == nil ? .announced : verdict,
            isMine: reply.isMe
        )
        return own + [quoted]
    }

    /// **Le verdict que la peau rend** — annoncé OU noir : une flamme d'autrui
    /// dont l'identifiant n'est pas encore celui du serveur ne peut pas
    /// s'annoncer (la passerelle ne jugerait pas un `cid_…`) ; elle reste
    /// noire jusqu'à ce qu'il le soit. Ses propres messages ne s'annoncent
    /// jamais (la passerelle les ignore) : ils gardent leur verdict.
    static func renderedVerdict(for message: Message) -> ContentExitLaw.CaptureVerdict {
        let verdict = message.exitOffer.capture
        guard verdict == .announced, !message.isMe, !ContentCaptureReport.isDeclarableMessageId(message.id) else {
            return verdict
        }
        return .blocked
    }

    /// La pièce d'un plein écran : celle de son porteur, ouverte — une vue
    /// unique présentée en grand se déclare, c'est une tentative.
    static func candidates(forPresented carrier: Message) -> [ContentCaptureCandidate] {
        guard carrier.messageSource != .system, !carrier.isDeleted else { return [] }
        return [ContentCaptureCandidate(
            conversationId: carrier.conversationId,
            messageId: carrier.id,
            capture: carrier.exitOffer.capture,
            isMine: carrier.isMe
        )]
    }
}

/// **Détecter une capture et la déclarer** — protocole avant l'implémentation.
@MainActor
protocol ContentCaptureReporterProviding: AnyObject {
    func install()
    func register(_ source: ContentCaptureSource)
    func unregister(_ source: ContentCaptureSource)
    /// La page d'un plein écran change (`nil` : il se ferme).
    func noteFullscreenAttachment(_ attachmentId: String?)
    var fullscreenAttachmentId: String? { get }
    func screenshotTaken()
    func screenCaptureChanged(isCaptured: Bool)
}

/// Le chemin réel : `userDidTakeScreenshotNotification` pour la capture,
/// `UIScreen.capturedDidChangeNotification` + `isCaptured` pour
/// l'enregistrement et la recopie (AirPlay, écran externe) — tous deux
/// disponibles d'iOS 16 à 26 ; `sceneCaptureState` (iOS 17+) n'apporterait rien
/// de plus et laisserait iOS 16 sans détection.
///
/// La déclaration est DURABLE (`ContentCaptureDeclaring`) : une flamme montrée
/// en clair dont la capture ne s'annoncerait pas serait une capture silencieuse.
@MainActor
final class ContentCaptureReporter: ContentCaptureReporterProviding {
    // SE-0466 : la deinit synthétisée serait isolée au MainActor (cible app).
    nonisolated deinit {}

    static let shared = ContentCaptureReporter()

    private struct WeakSource {
        weak var value: ContentCaptureSource?
    }

    private let declarer: ContentCaptureDeclaring
    private let isConversationCovered: @MainActor () -> Bool
    private let isScreenCaptured: @MainActor () -> Bool
    private let now: @MainActor () -> Date
    private let newCaptureId: @MainActor () -> String

    private var sources: [WeakSource] = []
    private var observers: [NSObjectProtocol] = []
    private var recordingTimer: Timer?
    private(set) var tracker = ContentCaptureTracker()
    private(set) var fullscreenAttachmentId: String?

    init(
        declarer: ContentCaptureDeclaring = OutboxContentCaptureDeclarer(),
        isConversationCovered: @escaping @MainActor () -> Bool = { ConversationViewingReporter.shared.isCovered },
        isScreenCaptured: @escaping @MainActor () -> Bool = {
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.contains { $0.screen.isCaptured }
        },
        now: @escaping @MainActor () -> Date = { Date() },
        newCaptureId: @escaping @MainActor () -> String = { ContentCaptureReport.newCaptureId() }
    ) {
        self.declarer = declarer
        self.isConversationCovered = isConversationCovered
        self.isScreenCaptured = isScreenCaptured
        self.now = now
        self.newCaptureId = newCaptureId
    }

    /// Installé UNE fois au lancement. Un enregistrement déjà en cours à
    /// l'ouverture de l'application commence sa session tout de suite.
    func install() {
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        observers = [
            center.addObserver(forName: UIApplication.userDidTakeScreenshotNotification, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { ContentCaptureReporter.shared.screenshotTaken() }
            },
            center.addObserver(forName: UIScreen.capturedDidChangeNotification, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated {
                    let reporter = ContentCaptureReporter.shared
                    reporter.screenCaptureChanged(isCaptured: reporter.isScreenCaptured())
                }
            },
        ]
        if isScreenCaptured() { screenCaptureChanged(isCaptured: true) }
    }

    func register(_ source: ContentCaptureSource) {
        sources.removeAll { $0.value == nil || $0.value === source }
        sources.append(WeakSource(value: source))
    }

    func unregister(_ source: ContentCaptureSource) {
        sources.removeAll { $0.value == nil || $0.value === source }
    }

    func noteFullscreenAttachment(_ attachmentId: String?) {
        fullscreenAttachmentId = attachmentId
    }

    /// Ce qui est RÉELLEMENT à l'écran : sous un plein écran, ce qu'il montre ;
    /// sinon chaque surface montée.
    func visibleCandidates() -> [ContentCaptureCandidate] {
        visibleSources().flatMap { $0.visibleCaptureCandidates() }
    }

    private func visibleSources() -> [ContentCaptureSource] {
        sources.removeAll { $0.value == nil }
        let covered = isConversationCovered()
        return sources.compactMap(\.value).filter { !covered || $0.isCaptureCover }
    }

    func screenshotTaken() {
        declare(tracker.screenshot(visible: visibleCandidates(), captureId: newCaptureId()))
    }

    func screenCaptureChanged(isCaptured: Bool) {
        if isCaptured {
            guard !tracker.isRecording else { return }
            declare(tracker.recordingStarted(visible: visibleCandidates(), captureId: newCaptureId(), at: now()))
            startRecordingBeat()
        } else {
            guard tracker.isRecording else { return }
            stopRecordingBeat()
            declare(tracker.recordingEnded(visible: visibleCandidates(), at: now()))
        }
    }

    /// Le battement d'un enregistrement : chaque éphémère qui PARAÎT pendant
    /// qu'il tourne se déclare, sous le même identifiant.
    func recordingBeat() {
        guard tracker.isRecording else { return }
        declare(tracker.note(visible: visibleCandidates(), at: now()))
    }

    private func startRecordingBeat() {
        recordingTimer?.invalidate()
        let timer = Timer(timeInterval: 1, repeats: true) { _ in
            MainActor.assumeIsolated { ContentCaptureReporter.shared.recordingBeat() }
        }
        timer.tolerance = 0.3
        RunLoop.main.add(timer, forMode: .common)
        recordingTimer = timer
    }

    private func stopRecordingBeat() {
        recordingTimer?.invalidate()
        recordingTimer = nil
    }

    /// Les surfaces posent d'abord l'accusé de lecture de ce qu'elles
    /// montrent, puis la déclaration entre dans la file durable.
    private func declare(_ reports: [ContentCaptureReport]) {
        guard !reports.isEmpty else { return }
        visibleSources().forEach { $0.acknowledgeVisibleReads() }
        declarer.declare(reports)
    }
}

// MARK: - La déclaration durable

/// **Déclarer une capture sans jamais la perdre** — protocole avant
/// l'implémentation.
@MainActor
protocol ContentCaptureDeclaring: AnyObject {
    func declare(_ reports: [ContentCaptureReport])
}

/// Chaque déclaration entre dans la file hors ligne (`OutboxKind
/// .reportContentCapture`) : persistée, elle survit à l'arrière-plan, à la
/// perte du réseau et au relancement, et se rejoue avec le recul exponentiel
/// de la file tant que la passerelle l'accepte (24 h après la lecture) ; seul
/// un refus FINAL la fait partir (`ContentCaptureDispatchOutcome`). La file
/// est vidée après `readSettleDelay`, le temps que l'accusé de lecture posé à
/// l'instant de la capture précède la déclaration.
@MainActor
final class OutboxContentCaptureDeclarer: ContentCaptureDeclaring {
    nonisolated deinit {}

    private let readSettleDelay: Duration
    private let logger = Logger(subsystem: "me.meeshy.app", category: "content-capture")

    init(readSettleDelay: Duration = .milliseconds(1500)) {
        self.readSettleDelay = readSettleDelay
    }

    func declare(_ reports: [ContentCaptureReport]) {
        let delay = readSettleDelay
        let logger = logger
        Task { @MainActor in
            for report in reports {
                do {
                    try await OfflineQueue.shared.enqueue(
                        .reportContentCapture,
                        payload: ReportContentCapturePayload(report: report),
                        conversationId: report.conversationId
                    )
                } catch {
                    logger.error("capture declaration not queued conv=\(report.conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                }
            }
            try? await Task.sleep(for: delay)
            await OutboxFlushTrigger.flushNow()
        }
    }
}

// MARK: - Une surface MESURÉE (la Rivière)

/// Une surface SwiftUI qui mesure déjà le cadre de ses bulles
/// (`MessageFramePreferenceKey`) : est à l'écran ce dont le cadre croise la
/// partie lue du pane. La surface POSE ses messages et ses cadres ; le
/// rapporteur ne la lit qu'à l'instant d'une capture.
@MainActor
final class MeasuredCaptureSurface: ContentCaptureSource {
    nonisolated deinit {}

    private var messagesById: [String: Message] = [:]
    private var frames: [String: CGRect] = [:]
    private var viewport: CGRect = .zero

    var isCaptureCover: Bool { false }

    func update(messages: [Message]) {
        messagesById = Dictionary(messages.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
    }

    func update(frames: [String: CGRect], viewport: CGRect) {
        self.frames = frames
        self.viewport = viewport
    }

    func visibleCaptureCandidates() -> [ContentCaptureCandidate] {
        guard !viewport.isEmpty else { return [] }
        return frames
            .filter { $0.value.intersects(viewport) }
            .sorted { $0.value.minY < $1.value.minY }
            .compactMap { messagesById[$0.key] }
            .flatMap { ContentCaptureVisibility.candidates(for: $0, serverId: nil) }
    }
}

// MARK: - Un plein écran (la galerie, le plein écran audio)

/// Le plein écran de la conversation : sa page courante (rapportée par la
/// galerie, `noteFullscreenAttachment`), sinon la pièce d'ouverture — et le
/// porteur de cette pièce, résolu par l'hôte.
@MainActor
final class FullscreenCaptureSurface: ContentCaptureSource {
    nonisolated deinit {}

    private let startAttachmentId: String
    private let carrier: @MainActor (String) -> Message?
    private let currentAttachmentId: @MainActor () -> String?
    private let acknowledgeRead: @MainActor (Message) -> Void

    init(
        startAttachmentId: String,
        carrier: @escaping @MainActor (String) -> Message?,
        acknowledgeRead: @escaping @MainActor (Message) -> Void = { _ in },
        currentAttachmentId: @escaping @MainActor () -> String? = { ContentCaptureReporter.shared.fullscreenAttachmentId }
    ) {
        self.startAttachmentId = startAttachmentId
        self.carrier = carrier
        self.acknowledgeRead = acknowledgeRead
        self.currentAttachmentId = currentAttachmentId
    }

    var isCaptureCover: Bool { true }

    private var presented: Message? { carrier(currentAttachmentId() ?? startAttachmentId) }

    func visibleCaptureCandidates() -> [ContentCaptureCandidate] {
        presented.map(ContentCaptureVisibility.candidates(forPresented:)) ?? []
    }

    func acknowledgeVisibleReads() {
        guard let message = presented, !message.isMe else { return }
        acknowledgeRead(message)
    }
}
