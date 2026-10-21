import Foundation
import Combine
import MeeshySDK
import os
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Chaque interaction avec un contenu est capturée (#10499, #10500)

/// Le point d'entrée UNIQUE des événements v2 dans l'app. Les sites
/// (mutations, lecteurs, capture d'écran, défilement) appellent `emit` ; le
/// rapporteur range, échantillonne, groupe et envoie.
@MainActor
protocol SocialEventsV2Reporting: AnyObject {
    func emit(_ event: SocialEventV2)
    func flushNow() async
}

/// SOUS QUELLE identité un événement est vu : un compte, ou un visiteur (dont
/// la file porte une EMPREINTE du jeton, jamais le jeton).
struct SocialEventsV2Identity: Equatable {
    let owner: String
    let credential: SocialEventsCredential

    @MainActor
    static func live() -> SocialEventsV2Identity? {
        if let userId = AuthManager.shared.currentUser?.id, !userId.isEmpty {
            return SocialEventsV2Identity(owner: userId, credential: .account)
        }
        // Un jeton DÉJÀ détenu seulement : la télémétrie ne fabrique jamais
        // de clé visiteur à elle seule.
        guard let token = VisitorReachReporter.liveKnownTokens().first, !token.isEmpty else { return nil }
        return SocialEventsV2Identity(owner: "visitor:" + PendingVisitorEvent.identity(of: token), credential: .visitor(token))
    }
}

/// Le consentement d'analyse tel que le CLIENT le connaît (#10499) — vie
/// privée d'abord, la qualification juridique (#10511) n'étant pas tranchée :
/// bascule « Analytique » coupée (valeur par défaut comprise) ⇒ `denied`,
/// toujours, même si la passerelle garde un accord plus ancien ; bascule active
/// ⇒ `granted` seulement si la passerelle l'a confirmé, `unknown` sinon. La
/// passerelle seule ACCORDE.
///
/// UNE règle pour les deux lots (#10552) : le lot v2 la lit par son contexte,
/// le lot de COMPTAGE par la source installée au lancement — sans quoi une
/// impression gardait rang, page et visibilité pour un compte qui a refusé.
enum AnalyticsConsentStanding {
    static func consent(allowAnalytics: Bool, serverGranted: Bool) -> SocialEventContext.Consent {
        guard allowAnalytics else { return .denied }
        return serverGranted ? .granted : .unknown
    }

    static func live() -> SocialEventContext.Consent {
        consent(
            allowAnalytics: UserPreferencesManager.shared.privacy.allowAnalytics,
            serverGranted: UserPreferencesManager.shared.grantedConsents.contains(.analytics)
        )
    }

    /// Relu à CHAQUE lot : une bascule coupée vaut dès le lot suivant.
    static func installOnCountingBatches(
        _ source: SocialEventsConsentSource = .shared,
        standing: @escaping @MainActor @Sendable () -> SocialEventContext.Consent = { AnalyticsConsentStanding.live() }
    ) {
        source.install { standing() }
    }
}

/// Ce que l'app sait d'elle-même au moment d'un lot.
@MainActor
protocol SocialEventContextProviding: AnyObject {
    func appSessionId(at now: Date) -> String
    func context(at now: Date, sampling: [String: Double]) -> SocialEventContext
}

@MainActor
final class LiveSocialEventContextProvider: SocialEventContextProviding {
    nonisolated deinit {}

    private var clock = AppSessionClock()

    func appSessionId(at now: Date) -> String {
        clock.touch(at: now)
    }

    func context(at now: Date, sampling: [String: Double]) -> SocialEventContext {
        let info = Bundle.main.infoDictionary
        #if canImport(UIKit)
        let device = UIDevice.current
        let os = SocialEventContext.OS(name: device.systemName, version: device.systemVersion)
        let deviceClass: SocialEventContext.DeviceClass = device.userInterfaceIdiom == .pad ? .tablet
            : device.userInterfaceIdiom == .mac ? .desktop : .phone
        #else
        let os: SocialEventContext.OS? = nil
        let deviceClass: SocialEventContext.DeviceClass? = nil
        #endif
        let rates = sampling.filter { $0.value < 1 }
        return SocialEventContext(
            appSessionId: appSessionId(at: now),
            appVersion: info?["CFBundleShortVersionString"] as? String,
            build: info?["CFBundleVersion"] as? String,
            os: os,
            deviceClass: deviceClass,
            network: SocialEventContext.Network(snapshot: NetworkPathSource.shared.current),
            uiLanguage: AuthManager.shared.currentUser?.systemLanguage,
            deviceLocale: Locale.current.language.languageCode?.identifier,
            consent: AnalyticsConsentStanding.live(),
            capabilities: SocialEventContext.Capability.allCases,
            sampling: rates.isEmpty ? nil : rates
        )
    }
}

/// La file v2 de l'app. Cadence : au plus toutes les 10 s ou tous les 50
/// événements, plus un envoi au passage en arrière-plan. Un 400 (serveur qui
/// ne connaît pas la v2) jette la file v2 et la met en sommeil une heure ;
/// les files de COMPTAGE (impressions, vues, séances) ne sont jamais touchées.
@MainActor
final class SocialEventsV2Reporter: SocialEventsV2Reporting {
    // SE-0466 : la deinit synthétisée serait isolée au MainActor (cible app).
    nonisolated deinit {}

    static let shared = SocialEventsV2Reporter()

    private static let logger = MeeshyLog.logger(.socialEventsV2)

    private let outbox: SocialEventsV2Outbox
    private let postService: PostServiceProviding
    private let contextProvider: SocialEventContextProviding
    private let identity: @MainActor () -> SocialEventsV2Identity?
    private let now: @MainActor () -> Date
    private let flushInterval: Duration
    private let inbox: SocialNotificationInbox

    private(set) var gate = SocialEventsV2Gate()
    private(set) var sampling: [String: Double] = [:]
    private var queuedSinceFlush = 0
    private var enqueueChain: Task<Void, Never>?
    private var flushTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    init(
        outbox: SocialEventsV2Outbox = .shared,
        postService: PostServiceProviding = PostService.shared,
        contextProvider: SocialEventContextProviding = LiveSocialEventContextProvider(),
        identity: @escaping @MainActor () -> SocialEventsV2Identity? = { SocialEventsV2Identity.live() },
        now: @escaping @MainActor () -> Date = { Date() },
        flushInterval: Duration = .seconds(10),
        inbox: SocialNotificationInbox = .shared,
        observesLifecycle: Bool = true
    ) {
        self.outbox = outbox
        self.postService = postService
        self.contextProvider = contextProvider
        self.identity = identity
        self.now = now
        self.flushInterval = flushInterval
        self.inbox = inbox
        if observesLifecycle { subscribeToAppLifecycle() }
    }

    /// Les services du SDK (mutations, lecture) émettent par
    /// `SocialEventsV2Hub` ; installé une fois au lancement.
    static func installHub(_ hub: SocialEventsV2Hub = .shared) {
        hub.install { event in
            Task { @MainActor in SocialEventsV2Reporter.shared.emit(event) }
        }
    }

    func emit(_ event: SocialEventV2) {
        guard let identity = identity() else { return }
        guard identity.credential == .account || event.payload.isAllowedForVisitor else { return }
        let sessionId = contextProvider.appSessionId(at: now())
        if event.payload.isSampleable {
            let rate = sampling[event.type] ?? 1
            guard SocialEventsSampling.keeps(type: event.type, rate: rate, appSessionId: sessionId) else { return }
        }
        let previous = enqueueChain
        let outbox = outbox
        let owner = identity.owner
        enqueueChain = Task { @MainActor in
            await previous?.value
            await outbox.enqueue([event], owner: owner)
        }
        queuedSinceFlush += 1
        if queuedSinceFlush >= SocialEventsV2Wire.batchSize {
            Task { @MainActor [weak self] in await self?.flushNow() }
        } else if flushTask == nil {
            scheduleFlush()
        }
    }

    func flushNow() async {
        flushTask?.cancel()
        flushTask = nil
        await enqueueChain?.value
        queuedSinceFlush = 0
        guard gate.isOpen(at: now()), let identity = identity() else { return }
        if identity.credential == .account {
            let received = inbox.drain()
            if !received.isEmpty { await outbox.enqueue(encoded: received, owner: identity.owner) }
        }
        let context = contextProvider.context(at: now(), sampling: sampling)
        let credential = identity.credential
        let service = postService
        for _ in 0..<4 {
            let sentAt = now()
            let outcome = await outbox.flush(owner: identity.owner) { payloads in
                await SocialEventsV2Dispatch.deliver(payloads, context: context, credential: credential, sentAt: sentAt, through: service)
            }
            guard let outcome else { return }
            switch outcome {
            case .delivered(let receipt):
                if let served = receipt.sampling { sampling = served }
            case .unsupported:
                gate.noteRefused(at: now())
                await outbox.dropAll(owner: identity.owner)
                Self.logger.info("social events v2 refused (400) — v2 queue dropped, asleep for an hour")
                return
            case .refused, .transient:
                return
            }
        }
    }

    private func scheduleFlush() {
        let interval = flushInterval
        flushTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: interval)
            guard !Task.isCancelled else { return }
            self?.flushTask = nil
            await self?.flushNow()
        }
    }

    private func subscribeToAppLifecycle() {
        #if canImport(UIKit)
        NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)
            .sink { [weak self] _ in
                Task { @MainActor in
                    // Les accumulateurs (défilement, lecture) se closent sur la
                    // même notification : on laisse passer leur émission.
                    await Task.yield()
                    await self?.flushInBackground()
                }
            }
            .store(in: &cancellables)
        #endif
    }

    #if canImport(UIKit)
    private func flushInBackground() async {
        let lease = SocialEventsBackgroundLease()
        lease.begin()
        await flushNow()
        lease.end()
    }
    #endif
}

#if canImport(UIKit)
/// La tâche d'arrière-plan d'un envoi de sortie : terminée UNE fois, par le
/// succès ou par l'expiration (UIKit tue l'app si elle ne l'est pas).
@MainActor
private final class SocialEventsBackgroundLease {
    nonisolated deinit {}

    private let provider = UIApplicationBackgroundTaskProvider()
    private var token = BackgroundTaskToken.invalid
    private var ended = false

    func begin() {
        token = provider.beginBackgroundTask(withName: "social-events-v2") { [weak self] in
            self?.end()
        }
    }

    func end() {
        guard !ended, token != .invalid else { return }
        ended = true
        provider.endBackgroundTask(token)
    }
}
#endif
