// apps/ios/MeeshyTests/Performance/MessageListPerformanceTests.swift
//
// XCTMetric-based benchmarks for the message list scroll path.
// Guards Phase 0-3 cumulative gains from regressions.
//
// These tests are intentionally gated behind RUN_PERF_BENCHMARKS=1 so they
// do NOT slow down the regular CI suite. Run via:
//   scripts/ios-perf-benchmark.sh

import XCTest
import GRDB
import SwiftUI
import UIKit
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class MessageListPerformanceTests: XCTestCase {

    // MARK: - Setup

    // Gating INVOCATIONNEL, PAS par variable d'environnement : sous
    // `xcodebuild test`, une var d'env (host, build-setting, ou SIMCTL_CHILD_)
    // n'atteint PAS le process de test dans le simulateur → `XCTSkip`
    // systématique (le bug "tout est skip"). La suite régulière exclut donc ces
    // classes via `-skip-testing` (cf. meeshy.sh), et
    // `scripts/ios-perf-benchmark.sh` les exécute via `-only-testing`.

    /// Logge l'appareil + iOS une fois par classe : les chiffres ne sont
    /// comparables qu'à environnement égal (16 Pro Max ≫ XR), et le warning
    /// rappelle que le simulateur n'est pas représentatif.
    override class func setUp() {
        super.setUp()
        PerfEnvironment.logAndWarn()
    }

    // MARK: - Benchmark: 1000-message load + section recompute

    /// Mesure le travail O(n) refait à CHAQUE `applySnapshot` (reversed + map
    /// d'items + groupByDay) sur la fenêtre chargée — le coût par émission du
    /// store. `loadInitial` est async @MainActor : on le fait une fois hors
    /// `measure` (deadlock connu de `measureAsync` sur du @MainActor).
    func test_snapshotDataPrep_loadedWindow_cpu() async throws {
        let pool = try makeDatabase(messageCount: 1000)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let store = MessageStore(conversationId: "c1", persistence: persistence)
        await store.loadInitial()

        XCTAssertEqual(store.messages.count, MessageStore.initialWindowSize,
            "loadInitial loads only the most-recent window (initialWindowSize); older messages page in on scroll")

        let opts = XCTMeasureOptions()
        opts.iterationCount = 10
        measure(metrics: [XCTClockMetric(), XCTCPUMetric()], options: opts) {
            let reversed = Array(store.messages.reversed())
            _ = reversed.map { $0.localId }
            _ = MessageDayGrouping.groupByDay(dates: reversed.map(\.createdAt), calendar: .current)
        }
    }

    /// Measures repeated iteration over a 1000-message slice — simulates the
    /// per-frame work of a fast scroll through a pre-loaded MessageStore.
    func test_messageWindowIteration_1000Messages_underBudget() async throws {
        let pool = try makeDatabase(messageCount: 1000)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let store = MessageStore(conversationId: "c1", persistence: persistence)
        await store.loadInitial()

        let options = XCTMeasureOptions()
        options.iterationCount = 10

        measure(options: options) {
            var sum = 0
            for msg in store.messages {
                sum += msg.content?.count ?? 0
            }
            XCTAssertGreaterThan(sum, 0)
        }
    }

    /// Verifies that the `index(of:)` lookup (used by UICollectionView
    /// data-source diffs) stays O(1) after 1000-message load.
    func test_indexLookup_afterLoadInitial_isConstantTime() async throws {
        let pool = try makeDatabase(messageCount: 1000)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let store = MessageStore(conversationId: "c1", persistence: persistence)
        await store.loadInitial()

        // Index borné par la fenêtre initiale (initialWindowSize = 200), pas
        // le total inséré — `loadInitial` ne charge que la fenêtre récente.
        let targetId = store.messages[100].localId

        let options = XCTMeasureOptions()
        options.iterationCount = 10

        measure(options: options) {
            let idx = store.index(of: targetId)
            XCTAssertEqual(idx, 100)
        }
    }

    // MARK: - Realistic large-corpus benchmarks (kilo-message, contenu réel)
    //
    // Stores réalistes : 2000 messages, contenu varié (texte court/long,
    // mentions @, liens https, emoji), pièces jointes (1/7), réactions (1/5),
    // langues mélangées (fr/en/es), horodatages répartis sur 30 jours. Mesure
    // CPU RÉELLE (XCTCPUMetric) — pas un proxy d'itération.

    /// Coût de conversion `MessageRecord → MeeshyMessage` à l'échelle d'une
    /// vraie conversation. Avec pièces jointes + réactions, `toMessage` fait
    /// jusqu'à 5 passes `JSONDecoder` — c'est le travail refait par cellule.
    func test_toMessage_realisticCorpus_2000_cpu() throws {
        let records = PerfMessageRecordFactory.realisticCorpus(count: 2000)
        let opts = XCTMeasureOptions()
        opts.iterationCount = 5
        measure(metrics: [XCTClockMetric(), XCTCPUMetric(), XCTMemoryMetric()], options: opts) {
            for r in records { _ = r.toMessage(currentUserId: "user_me") }
        }
    }

    /// Construction du value-model `BubbleContent` (emoji analyze, filtres
    /// d'attachments, agrégation de réactions) — le hot path reconstruit à
    /// chaque évaluation de body de bulle.
    func test_bubbleContent_realisticCorpus_2000_cpu() throws {
        let messages = PerfMessageRecordFactory.realisticCorpus(count: 2000)
            .map { $0.toMessage(currentUserId: "user_me") }
        let opts = XCTMeasureOptions()
        opts.iterationCount = 5
        measure(metrics: [XCTClockMetric(), XCTCPUMetric()], options: opts) {
            for m in messages {
                _ = BubbleContent(
                    message: m,
                    translations: [],
                    preferredTranslation: nil,
                    currentUserId: "user_me"
                )
            }
        }
    }

    /// Regroupement par jour sur 2000 messages répartis sur 30 jours — le
    /// travail O(n) refait à chaque `applySnapshot`.
    func test_groupByDay_realistic_2000_cpu() throws {
        let base = Date(timeIntervalSince1970: 1_700_000_000)
        let span = 30.0 * 86_400.0
        let dates = (0..<2000).map { base.addingTimeInterval(Double($0) * (span / 2000.0)) }
        let cal = Calendar.current
        let opts = XCTMeasureOptions()
        opts.iterationCount = 10
        measure(metrics: [XCTClockMetric(), XCTCPUMetric()], options: opts) {
            _ = MessageDayGrouping.groupByDay(dates: dates, calendar: cal)
        }
    }

    /// VRAI rendu de liste : héberge le `MessageListViewController` réel avec
    /// un store de 2000 messages (fenêtre grandie vers ~1000 chargés, état
    /// scroll profond), dans une `UIWindow`, et force le layout — ce qui REND
    /// les vraies cellules SwiftUI `ThemedMessageBubble` via UIHostingConfig.
    /// C'est le scénario exact « ouvrir une conversation chargée ».
    func test_openConversation_messageListVC_realistic_render() async throws {
        let pool = try makeRealisticDatabase(messageCount: 2000)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let store = MessageStore(conversationId: "c1", persistence: persistence)
        await store.loadInitial()
        // Faire grandir la fenêtre chargée vers un état "scroll profond"
        // (~1000) pour qu'`applySnapshot` traite un grand item-set réaliste,
        // pas seulement la fenêtre initiale de 200.
        var rounds = 0
        while store.messages.count < 1000, rounds < 30 {
            guard let oldest = store.messages.first?.createdAt else { break }
            let grew = await store.loadOlder(before: oldest)
            rounds += 1
            if !grew { break }
        }
        XCTAssertGreaterThanOrEqual(store.messages.count, 200,
            "la fenêtre doit contenir au moins les 200 messages initiaux")

        // Construits une seule fois — ce ne sont pas l'objet mesuré.
        let router = Router()
        let stories = StoryViewModel()
        let statuses = StatusViewModel()
        let convList = ConversationListViewModel()

        let opts = XCTMeasureOptions()
        opts.iterationCount = 5
        measure(metrics: [XCTClockMetric(), XCTCPUMetric()], options: opts) {
            let vc = MessageListViewController(
                store: store,
                currentUserId: "user_me",
                accentColor: "#6366F1",
                isDirect: false,
                isDark: false,
                router: router,
                storyViewModel: stories,
                statusViewModel: statuses,
                conversationListViewModel: convList
            )
            let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
            window.rootViewController = vc
            window.makeKeyAndVisible()
            // viewDidLoad → applySnapshot (map O(n) + groupByDay + diff) +
            // réalisation des cellules visibles (rendu SwiftUI réel des bulles).
            vc.view.layoutIfNeeded()
            RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.03))
        }
    }

    /// VRAI STRESS DE SCROLL — temps de réaction. Héberge le VC réel avec une
    /// grande fenêtre chargée (~2000), puis scrolle programmatiquement TOUT
    /// l'historique en `steps` pas, en forçant le layout à chaque pas. Chaque
    /// pas DEQUEUE + RECONFIGURE les cellules entrantes (toMessage + build bulle
    /// + UIHostingConfiguration) + `scrollViewDidScroll` (sticky day label) —
    /// exactement le travail d'un scroll utilisateur. Coût CPU / pas ≈ le temps
    /// de réaction par frame de scroll.
    func test_scroll_messageListVC_realistic_reactionCost() async throws {
        let pool = try makeRealisticDatabase(messageCount: 5000)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let store = MessageStore(conversationId: "c1", persistence: persistence)
        await store.loadInitial()
        var rounds = 0
        while store.messages.count < 2000, rounds < 60 {
            guard let oldest = store.messages.first?.createdAt else { break }
            if !(await store.loadOlder(before: oldest)) { break }
            rounds += 1
        }
        let loaded = store.messages.count

        let router = Router()
        let stories = StoryViewModel()
        let statuses = StatusViewModel()
        let convList = ConversationListViewModel()
        let vc = MessageListViewController(
            store: store, currentUserId: "user_me", accentColor: "#6366F1",
            isDirect: false, isDark: false, router: router,
            storyViewModel: stories, statusViewModel: statuses,
            conversationListViewModel: convList
        )
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()
        guard let cv = vc.view.subviews.compactMap({ $0 as? UICollectionView }).first else {
            return XCTFail("UICollectionView introuvable dans la hiérarchie du VC")
        }

        let steps = 80
        print("[PERF] scroll stress : \(loaded) messages chargés, \(steps) pas/itération")
        let opts = XCTMeasureOptions()
        opts.iterationCount = 5
        measure(metrics: [XCTClockMetric(), XCTCPUMetric(), XCTMemoryMetric()], options: opts) {
            cv.setContentOffset(.zero, animated: false)
            cv.layoutIfNeeded()
            let maxY = max(0, cv.contentSize.height - cv.bounds.height)
            let stepPx = maxY / CGFloat(steps)
            var y: CGFloat = 0
            for _ in 0..<steps {
                y += stepPx
                cv.setContentOffset(CGPoint(x: 0, y: y), animated: false)
                cv.layoutIfNeeded()
            }
        }
    }

    /// FOOTPRINT MÉMOIRE + VOLUME DE DONNÉES EMBARQUÉ. Logge le poids réel du
    /// corpus (contenu texte, JSON pièces jointes, JSON réactions) et mesure la
    /// mémoire physique de la conversion `MessageRecord → MeeshyMessage` à
    /// l'échelle d'une grosse conversation.
    func test_memoryFootprint_andDataVolume_5000() throws {
        let records = PerfMessageRecordFactory.realisticCorpus(count: 5000)
        let contentBytes = records.reduce(0) { $0 + ($1.content?.utf8.count ?? 0) }
        let attBytes = records.reduce(0) { $0 + ($1.attachmentsJson?.count ?? 0) }
        let reactBytes = records.reduce(0) { $0 + ($1.reactionsJson?.count ?? 0) }
        let total = contentBytes + attBytes + reactBytes
        print("""
        [PERF] volume embarqué (5000 msgs) :
          texte            = \(contentBytes / 1024) KB
          attachmentsJSON  = \(attBytes / 1024) KB
          reactionsJSON    = \(reactBytes / 1024) KB
          TOTAL brut       = \(total / 1024) KB (~\(total / 5000) o/msg)
        """)

        let opts = XCTMeasureOptions()
        opts.iterationCount = 5
        measure(metrics: [XCTMemoryMetric(), XCTClockMetric()], options: opts) {
            let domain = records.map { $0.toMessage(currentUserId: "user_me") }
            XCTAssertEqual(domain.count, 5000)
        }
    }

    /// DELTA RSS ISOLÉ — rendu vs données, MESURÉ dans le MÊME process (au lieu
    /// de soustraire deux pics de tests différents). On charge les données
    /// (~2000 msgs), on relève le RSS, PUIS on construit le VC + on réalise
    /// plusieurs écrans de cellules, et on relève le RSS à nouveau. Le Δ est le
    /// surcoût mémoire RÉEL du chemin de rendu (VC + cellules + UIHostingController).
    func test_memory_renderingPath_isolatedDelta() async throws {
        let pool = try makeRealisticDatabase(messageCount: 5000)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let store = MessageStore(conversationId: "c1", persistence: persistence)
        await store.loadInitial()
        var rounds = 0
        while store.messages.count < 2000, rounds < 60 {
            guard let oldest = store.messages.first?.createdAt else { break }
            if !(await store.loadOlder(before: oldest)) { break }
            rounds += 1
        }
        let loaded = store.messages.count

        // RSS après chargement des données (records + domain dans le store).
        let rssAfterData = MemoryProbe.residentMB()

        // Chemin de RENDU : VC + fenêtre + réalisation de plusieurs écrans.
        let router = Router()
        let stories = StoryViewModel()
        let statuses = StatusViewModel()
        let convList = ConversationListViewModel()
        let vc = MessageListViewController(
            store: store, currentUserId: "user_me", accentColor: "#6366F1",
            isDirect: false, isDark: false, router: router,
            storyViewModel: stories, statusViewModel: statuses,
            conversationListViewModel: convList
        )
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()
        if let cv = vc.view.subviews.compactMap({ $0 as? UICollectionView }).first {
            for i in 1...12 {
                cv.setContentOffset(CGPoint(x: 0, y: CGFloat(i) * 700), animated: false)
                cv.layoutIfNeeded()
            }
        }

        // RSS après rendu — le VC est TOUJOURS vivant à ce point.
        let rssAfterRender = MemoryProbe.residentMB()
        let renderDelta = rssAfterRender - rssAfterData

        print(String(
            format: "[PERF] RSS isolé (%d msgs chargés) : données=%.0fMB → après rendu=%.0fMB | Δ RENDU (VC+cellules+hosting) MESURÉ = %.0fMB",
            loaded, rssAfterData, rssAfterRender, renderDelta
        ))
        XCTAssertGreaterThan(loaded, 0)
        withExtendedLifetime([vc, window, store]) {}
    }

    /// AVANT/APRÈS de la mémoïsation `toMessage`. Le ViewModel re-mappait TOUTE
    /// la fenêtre via `toMessage` à chaque émission du store (3-4× à l'ouverture,
    /// + à chaque event). COLD = `record.toMessage` direct (décodage JSON à
    /// chaque fois, comme AVANT). WARM = `store.domainMessages` (cache
    /// changeVersion : le 1er re-map peuple, les suivants hit → 0 décodage).
    func test_toMessage_storeReMap_warmVsCold() async throws {
        let pool = try makeRealisticDatabase(messageCount: 5000)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let store = MessageStore(conversationId: "c1", persistence: persistence)
        await store.loadInitial()
        var rounds = 0
        while store.messages.count < 2000, rounds < 60 {
            guard let oldest = store.messages.first?.createdAt else { break }
            if !(await store.loadOlder(before: oldest)) { break }
            rounds += 1
        }
        let records = store.messages
        let reEmissions = 6

        // COLD : toMessage direct, sans cache (comportement d'AVANT).
        let coldStart = Date()
        for _ in 0..<reEmissions { _ = records.map { $0.toMessage(currentUserId: "user_me") } }
        let coldMs = Date().timeIntervalSince(coldStart) * 1000

        // WARM : via le cache du store (1er re-map peuple, les 5 suivants hit).
        let warmStart = Date()
        for _ in 0..<reEmissions { _ = store.domainMessages(currentUserId: "user_me") }
        let warmMs = Date().timeIntervalSince(warmStart) * 1000

        let speedup = coldMs / max(warmMs, 0.0001)
        print(String(
            format: "[PERF] toMessage re-map ×%d sur %d msgs : AVANT(direct)=%.1fms  APRÈS(cache)=%.1fms  → ×%.1f plus rapide",
            reEmissions, records.count, coldMs, warmMs, speedup
        ))
        XCTAssertLessThan(warmMs, coldMs, "le cache doit battre le décodage répété")
    }

    // MARK: - Helpers

    private func makeDatabase(messageCount: Int) throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)

        let now = Date()
        try db.write { db in
            for i in 0..<messageCount {
                let record = PerfMessageRecordFactory.make(
                    localId: "m\(i)",
                    conversationId: "c1",
                    content: "message \(i)",
                    createdAt: now.addingTimeInterval(Double(i))
                )
                try record.insert(db)
            }
        }
        return db
    }

    /// Seed une DB GRDB en mémoire avec un corpus réaliste à grande échelle.
    private func makeRealisticDatabase(messageCount: Int) throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        try db.write { db in
            for record in PerfMessageRecordFactory.realisticCorpus(count: messageCount) {
                try record.insert(db)
            }
        }
        return db
    }
}

// MARK: - Factory

private enum PerfMessageRecordFactory {
    static func make(
        localId: String = "temp_\(UUID().uuidString)",
        conversationId: String = "c1",
        content: String? = "Test message",
        createdAt: Date = Date()
    ) -> MessageRecord {
        MessageRecord(
            localId: localId,
            serverId: nil,
            conversationId: conversationId,
            senderId: "user_me",
            content: content,
            originalLanguage: "fr",
            messageType: "text",
            messageSource: "user",
            contentType: "text",
            state: .sent,
            retryCount: 0,
            lastError: nil,
            isEncrypted: false,
            encryptionMode: nil,
            encryptedPayload: nil,
            replyToId: nil,
            storyReplyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            replyToJson: nil,
            forwardedFromJson: nil,
            expiresAt: nil,
            effectFlags: 0,
            maxViewOnceCount: nil,
            viewOnceCount: 0,
            isEdited: false,
            editedAt: nil,
            deletedAt: nil,
            pinnedAt: nil,
            pinnedBy: nil,
            senderName: nil,
            senderUsername: nil,
            senderColor: nil,
            senderAvatarURL: nil,
            deliveredCount: 1,
            readCount: 0,
            deliveredToAllAt: nil,
            readByAllAt: nil,
            createdAt: createdAt,
            sentAt: nil,
            deliveredAt: nil,
            readAt: nil,
            updatedAt: createdAt,
            attachmentsJson: nil,
            reactionsJson: nil,
            reactionCount: 0,
            currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil,
            cachedBubbleHeight: nil,
            cachedLastLineWidth: nil,
            cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0,
            layoutMaxWidth: nil,
            changeVersion: 0
        )
    }

    // MARK: - Realistic corpus

    /// Pool de contenus réalistes : texte court/long, mentions @, liens https,
    /// emoji, mix FR/EN — pour stresser le rendu de texte (MessageTextRenderer)
    /// et la mise en page comme une vraie conversation.
    private static let contentPool: [String] = [
        "Ok",
        "👍",
        "Je suis en route, j'arrive dans 10 minutes",
        "Tu as vu le message de @julien ? https://meeshy.me/posts/42",
        "Haha 😂😂 trop drôle celle-là",
        "On se retrouve où ce soir finalement ?",
        "Récap réunion : feature lundi, QA mardi, prod mercredi. @marie tu gères le déploiement et @paul la comm ?",
        "Parfait, merci beaucoup 🙏",
        "Can you review the PR when you have a sec? https://github.com/isopen-io/meeshy/pull/405 🙏",
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco.",
        "👀",
        "Je t'envoie la photo tout de suite",
        "D'accord pour 19h au café du coin ☕️",
        "Non franchement je pense pas que ce soit une bonne idée, on en reparle demain à tête reposée ?",
        "🎉🎉🎉 félicitations !!",
    ]

    /// Corpus déterministe (pas de random → baselines stables) de `count`
    /// messages variés : pièces jointes (1/7), réactions (1/5), langues
    /// alternées (fr/en/es), expéditeur alterné, horodatages sur 30 jours.
    static func realisticCorpus(count: Int) -> [MessageRecord] {
        let base = Date(timeIntervalSince1970: 1_700_000_000)
        let span = 30.0 * 86_400.0
        let languages = ["fr", "en", "es"]
        let emojis = ["👍", "❤️", "😂"]
        return (0..<count).map { i in
            var r = make(
                localId: "m\(i)",
                conversationId: "c1",
                content: contentPool[i % contentPool.count],
                createdAt: base.addingTimeInterval(Double(i) * (span / Double(max(count, 1))))
            )
            r.senderId = (i % 3 == 0) ? "user_me" : "other_\(i % 5)"
            r.originalLanguage = languages[i % languages.count]
            if i % 7 == 0 {
                r.attachmentsJson = Data(#"[{"id":"att_\#(i)","mimeType":"image/jpeg","fileUrl":"https://cdn.meeshy.me/\#(i).jpg","width":1080,"height":1920,"fileSize":204800}]"#.utf8)
            }
            if i % 5 == 0 {
                let reactions = [MeeshyReaction(messageId: "m\(i)", participantId: "p\(i % 4)", emoji: emojis[i % emojis.count])]
                r.reactionsJson = try? JSONEncoder().encode(reactions)
                r.reactionCount = reactions.count
            }
            return r
        }
    }
}
