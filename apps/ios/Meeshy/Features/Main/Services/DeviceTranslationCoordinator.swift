import Combine
import Foundation
import MeeshySDK
import os

// MARK: - Le coordinateur de la traduction sur l'appareil (#9899)
//
// Décision porteur du 2026-10-10 : l'appareil de chaque membre traduit les
// messages reçus vers SA langue, les montre aussitôt, puis les partage aux
// autres membres par la passerelle — qui ne garde qu'une enveloppe SCELLÉE.
//
// Un coordinateur sert UNE conversation ouverte (`ConversationDeviceTranslationLayer`
// le monte et le démarre). Pour les messages récents du fil il fait, dans
// l'ordre, ce que ferait le serveur — et rien de plus :
//
// 1. LIRE ce que les autres ont déjà partagé (`GET`), une fois par version de
//    message : c'est ce qui fait converger tous les appareils sur le même texte,
//    et ce qui épargne un calcul — ou une feuille de téléchargement — à qui
//    n'en a pas besoin ;
// 2. TRADUIRE sur l'appareil ce qui manque encore, vers le rang le plus haut du
//    Prisme que le moteur sait faire (`DeviceTranslationTarget`), l'afficher
//    aussitôt (`DeviceTranslationConversationSource.applyDeviceTranslation`) ;
// 3. PARTAGER : sceller la traduction avec le texte original du message et la
//    poster (`SharedTranslationSeal`). Le partage est un effort : sans réseau,
//    la traduction reste locale, et personne n'est privé de rien.
//
// Les traductions que les AUTRES partagent arrivent par `message:translation-shared`
// et s'ouvrent avec le texte du message que l'appareil a déjà.
//
// Chiffrement de bout en bout (fail-closed). Un message d'une conversation `e2ee`
// est traduit et montré, mais seulement EN MÉMOIRE (`persisting: false`) : ni le
// disque, ni les caches partagés, ni la passerelle n'en reçoivent rien. La
// passerelle n'accepte, pour ces messages, que la dérivation `message-secret`
// — dont le secret voyage dans le message chiffré, lot cryptographique à venir.
//
// Règles qui tiennent la boucle (chacune a un site unique, voir plus bas) :
// - une traduction déjà servie n'est JAMAIS écrasée : on recalcule les rangs
//   servis juste avant d'appliquer, parce que le serveur ou un autre membre a pu
//   répondre pendant que l'appareil traduisait ;
// - un message reçoit au plus UNE tentative par version et par jeu de langues
//   (`LedgerEntry`) — un texte que le moteur ne sait pas traduire n'est pas
//   rejoué à chaque changement du fil ;
// - un passage à la fois (`drainPasses`) : les rafales de changements du fil se
//   fondent en un passage après un court délai de décantation.

// MARK: - La source : ce que le coordinateur lit de la conversation

/// La conversation vue par le coordinateur. Un protocole parce que le
/// coordinateur n'a pas à connaître `ConversationViewModel` : il lit des
/// messages, pose des traductions, et c'est tout.
@MainActor
protocol DeviceTranslationConversationSource: AnyObject {
    /// L'identifiant de la conversation pour les requêtes REST.
    var deviceTranslationConversationId: String { get }
    var deviceTranslationMessages: [Message] { get }
    /// Les langues du lecteur, DANS L'ORDRE du Prisme (`ReaderPrism.resolve`).
    var deviceTranslationReaderLanguages: [String] { get }
    /// Émet quand les messages ou leurs traductions changent — un signal, pas
    /// une valeur : le coordinateur relit l'état après sa décantation.
    var deviceTranslationTriggers: AnyPublisher<Void, Never> { get }
    /// Les langues dans lesquelles le message est déjà traduit, telles que la
    /// conversation les sert.
    func deviceTranslatedLanguages(of messageId: String) -> [String]
    /// Montre la traduction. `persisting: false` la garde en mémoire seulement —
    /// la règle des conversations chiffrées de bout en bout.
    func applyDeviceTranslation(_ translation: MessageTranslation, persisting: Bool)
}

// MARK: - La politique

/// Les bornes du coordinateur, en un seul endroit.
nonisolated enum DeviceTranslationPolicy {
    /// Les messages les plus récents que l'appareil traite. Aucun signal de
    /// visibilité par message n'est exposé à ce niveau : le fil récent est la
    /// meilleure approximation de ce que le lecteur regarde.
    static let windowSize = 40
    /// Les textes confiés au moteur en une fois.
    static let batchSize = 20
    /// Un texte plus long n'est ni traduit ni partagé (unités UTF-16) : le moteur
    /// de l'appareil y serait lent, et le partage garde sa borne bien en dessous
    /// de celle de la passerelle.
    static let maxSourceLength = 4_000
    /// Un message plus jeune que cela n'est pas lu côté passerelle : ses
    /// traductions n'existent pas encore, et celles qui naîtront arriveront par
    /// l'événement temps réel.
    static let freshWindow: TimeInterval = 20
    /// Le délai qui fond une rafale de changements du fil en un seul passage.
    static let settleDelay: Duration = .milliseconds(250)
    /// Les lectures de traductions partagées tentées pour une même version de
    /// message : sans réseau, on n'insiste pas à chaque changement du fil.
    static let maxFetchAttempts = 2
}

/// Ce qui part vers la passerelle : l'enveloppe est déjà scellée.
nonisolated struct DeviceTranslationShare: Sendable {
    let conversationId: String
    let body: ShareTranslationBody
}

// MARK: - Le coordinateur

@MainActor
final class DeviceTranslationCoordinator: ObservableObject {
    nonisolated deinit {}

    /// Le moteur de CETTE conversation : l'hôte qui le sert (`AppleTranslationHost`)
    /// est monté par la même vue.
    let engine: any DeviceTranslationEngineProviding

    private let sharing: any SharedTranslationServiceProviding
    private let sharedEvents: AnyPublisher<SharedTranslation, Never>

    private weak var source: (any DeviceTranslationConversationSource)?
    private var encryptionMode: String?
    private var isRunning = false
    private var cancellables = Set<AnyCancellable>()

    private var workerTask: Task<Void, Never>?
    private var workerGeneration = 0
    private var passRequested = false

    private var readersKey = ""
    private var ledger: [String: LedgerEntry] = [:]
    /// Les langues posées par le coordinateur, par message : la conversation ne
    /// les sert qu'après sa décantation, et un passage ne doit pas recalculer
    /// entre-temps ce qu'il vient de poser.
    private var applied: [String: Set<String>] = [:]

    private var shareQueue: [DeviceTranslationShare] = []
    private var shareTask: Task<Void, Never>?

    init(
        engine: any DeviceTranslationEngineProviding = DeviceTranslationEngineFactory.makeDefault(),
        sharing: any SharedTranslationServiceProviding = SharedTranslationService.shared,
        sharedEvents: AnyPublisher<SharedTranslation, Never> = SharedTranslationSocketChannel.events.eraseToAnyPublisher()
    ) {
        self.engine = engine
        self.sharing = sharing
        self.sharedEvents = sharedEvents
    }

    // MARK: - Cycle de vie

    /// Idempotent : un second appel ne fait que relayer le mode de chiffrement.
    func start(source: any DeviceTranslationConversationSource, encryptionMode: String?) {
        guard !isRunning else {
            update(encryptionMode: encryptionMode)
            return
        }
        isRunning = true
        self.source = source
        self.encryptionMode = encryptionMode
        source.deviceTranslationTriggers
            .sink { [weak self] in self?.requestPass() }
            .store(in: &cancellables)
        sharedEvents
            .receive(on: DispatchQueue.main)
            .sink { [weak self] shared in self?.receive(shared) }
            .store(in: &cancellables)
        requestPass()
    }

    /// Le travail en cours s'arrête ; les partages déjà scellés partent quand
    /// même — une traduction faite ne se jette pas parce que l'écran se ferme.
    func stop() {
        guard isRunning else { return }
        isRunning = false
        workerGeneration += 1
        workerTask?.cancel()
        workerTask = nil
        passRequested = false
        cancellables.removeAll()
        engine.cancelPending()
        source = nil
    }

    func update(encryptionMode: String?) {
        guard self.encryptionMode != encryptionMode else { return }
        self.encryptionMode = encryptionMode
        requestPass()
    }

    // MARK: - Le passage

    private func requestPass() {
        guard isRunning else { return }
        passRequested = true
        guard workerTask == nil else { return }
        let generation = workerGeneration
        workerTask = Task { [weak self] in
            await self?.drainPasses(generation: generation)
        }
    }

    private func drainPasses(generation: Int) async {
        while passRequested, isCurrent(generation) {
            try? await Task.sleep(for: DeviceTranslationPolicy.settleDelay)
            guard isCurrent(generation) else { break }
            passRequested = false
            await runPass(generation: generation)
        }
        if generation == workerGeneration { workerTask = nil }
    }

    private func isCurrent(_ generation: Int) -> Bool {
        generation == workerGeneration && !Task.isCancelled
    }

    private func runPass(generation: Int) async {
        guard let source else { return }
        let readers = source.deviceTranslationReaderLanguages
        guard readers.contains(where: { !isBlank($0) }) else { return }
        adopt(readers: readers)
        let messages = source.deviceTranslationMessages
        forget(except: messages)
        let plans = makePlans(from: messages, readers: readers)
        guard !plans.isEmpty else { return }
        let missing = await fetchShared(for: plans, readers: readers, generation: generation)
        guard isCurrent(generation), !missing.isEmpty else { return }
        await translate(missing, readers: readers, generation: generation)
    }

    // MARK: - Le registre des tentatives

    /// Ce que l'appareil a tenté pour UNE version d'un message.
    private struct LedgerEntry {
        let version: MessageVersion
        var fetchAttempts = 0
        /// Plus rien à essayer pour cette version et ces langues : le moteur a
        /// traduit, ou ne sait pas, ou a échoué.
        var isExhausted = false
    }

    /// Ce qui fait qu'un message n'est plus le même pour le traducteur : son
    /// texte, ou la langue qu'on lui prête. Une édition change l'un des deux.
    private struct MessageVersion: Equatable {
        let content: String
        let originalLanguage: String

        init(_ message: Message) {
            content = message.content
            originalLanguage = message.originalLanguage
        }
    }

    private struct Plan {
        let message: Message
        let version: MessageVersion
        let disposition: DeviceTranslationDisposition
    }

    /// Un autre jeu de langues change ce qu'il reste à faire : tout est à revoir.
    private func adopt(readers: [String]) {
        let key = readers.joined(separator: "|")
        guard key != readersKey else { return }
        readersKey = key
        ledger.removeAll()
    }

    /// Un message qui a quitté le fil n'a plus de registre.
    private func forget(except messages: [Message]) {
        let live = Set(messages.map(\.id))
        ledger = ledger.filter { live.contains($0.key) }
        applied = applied.filter { live.contains($0.key) }
    }

    private func track(_ message: Message) -> MessageVersion {
        let version = MessageVersion(message)
        guard ledger[message.id]?.version != version else { return version }
        ledger[message.id] = LedgerEntry(version: version)
        applied.removeValue(forKey: message.id)
        return version
    }

    private func markExhausted(_ plans: [Plan]) {
        for plan in plans where ledger[plan.message.id]?.version == plan.version {
            ledger[plan.message.id]?.isExhausted = true
        }
    }

    // MARK: - Ce qu'il reste à servir

    /// Les messages récents, les plus neufs d'abord, qu'il reste à traduire.
    private func makePlans(from messages: [Message], readers: [String]) -> [Plan] {
        var plans: [Plan] = []
        let newest = messages.sorted { $0.createdAt > $1.createdAt }.prefix(DeviceTranslationPolicy.windowSize)
        for message in newest {
            let disposition = DeviceTranslationEligibility.disposition(
                of: message, conversationEncryptionMode: encryptionMode
            )
            guard disposition != .skip,
                  message.content.utf16.count <= DeviceTranslationPolicy.maxSourceLength
            else { continue }
            let version = track(message)
            guard ledger[message.id]?.isExhausted != true,
                  candidates(of: message, readers: readers) != nil
            else { continue }
            plans.append(Plan(message: message, version: version, disposition: disposition))
        }
        return plans
    }

    /// Les rangs du Prisme qu'il reste à servir pour ce message — recalculés à
    /// chaque appel, sur ce que la conversation sert ET ce que le coordinateur
    /// vient de poser.
    private func candidates(of message: Message, readers: [String]) -> DeviceTranslationCandidates? {
        DeviceTranslationTarget.candidates(
            preferredLanguages: readers,
            originalLanguage: message.originalLanguage,
            translatedLanguages: servedLanguages(of: message.id)
        )
    }

    private func servedLanguages(of messageId: String) -> [String] {
        (source?.deviceTranslatedLanguages(of: messageId) ?? []) + Array(applied[messageId] ?? [])
    }

    // MARK: - 1. Les traductions que les autres ont partagées

    private func fetchShared(for plans: [Plan], readers: [String], generation: Int) async -> [Plan] {
        let wanted = plans.filter(isFetchable)
        guard let source, !wanted.isEmpty else { return plans }
        for plan in wanted { ledger[plan.message.id]?.fetchAttempts += 1 }
        let fetched: [SharedTranslation]
        do {
            fetched = try await sharing.fetch(
                conversationId: source.deviceTranslationConversationId,
                messageIds: wanted.map(\.message.id),
                languages: requestedLanguages(for: wanted, readers: readers)
            )
        } catch {
            Logger.deviceTranslation.info("shared translations unavailable: \(error.localizedDescription, privacy: .public)")
            return plans
        }
        guard isCurrent(generation) else { return plans }
        let byMessage = Dictionary(grouping: fetched, by: \.messageId)
        for plan in wanted {
            let ranked = (byMessage[plan.message.id] ?? []).sorted {
                rank(of: $0, in: readers) < rank(of: $1, in: readers)
            }
            for shared in ranked { accept(shared, for: plan.message, readers: readers) }
        }
        return plans.filter { candidates(of: $0.message, readers: readers) != nil }
    }

    private func isFetchable(_ plan: Plan) -> Bool {
        plan.disposition == .shareable
            && Date().timeIntervalSince(plan.message.createdAt) > DeviceTranslationPolicy.freshWindow
            && (ledger[plan.message.id]?.fetchAttempts ?? 0) < DeviceTranslationPolicy.maxFetchAttempts
    }

    /// Les langues à demander : les rangs qui manquent, sans doublon, dans l'ordre
    /// du lecteur.
    private func requestedLanguages(for plans: [Plan], readers: [String]) -> [String] {
        var seen = Set<String>()
        return plans
            .compactMap { candidates(of: $0.message, readers: readers)?.targets }
            .flatMap { $0 }
            .filter { seen.insert($0).inserted }
    }

    /// Le rang du lecteur qui porte cette traduction — la plus préférée d'abord,
    /// pour que les rangs inférieurs soient refusés une fois le meilleur posé.
    private func rank(of shared: SharedTranslation, in readers: [String]) -> Int {
        let target = MeeshyUser.normalizeLanguageForDedup(shared.targetLanguage)
        return readers.firstIndex { MeeshyUser.normalizeLanguageForDedup($0) == target } ?? Int.max
    }

    /// `message:translation-shared` : une traduction vient d'être partagée à la
    /// conversation. Sans le message sous la main, elle n'a rien à ouvrir — la
    /// prochaine ouverture de la conversation la lira.
    private func receive(_ shared: SharedTranslation) {
        guard isRunning, let source,
              let message = source.deviceTranslationMessages.first(where: { $0.id == shared.messageId })
        else { return }
        accept(shared, for: message, readers: source.deviceTranslationReaderLanguages)
    }

    /// Ouvre l'enveloppe avec le texte du message et, si elle s'ouvre, la montre.
    /// Refuse tout ce qui ne servirait à rien ou qui ne devrait pas être là :
    /// un autre message, un rang que le lecteur n'a pas ou a déjà, une
    /// conversation chiffrée de bout en bout, une enveloppe qui ne s'ouvre pas.
    @discardableResult
    private func accept(_ shared: SharedTranslation, for message: Message, readers: [String]) -> Bool {
        let target = MeeshyUser.normalizeLanguageForDedup(shared.targetLanguage)
        guard shared.messageId == message.id,
              shared.conversationId == message.conversationId,
              DeviceTranslationEligibility.disposition(
                  of: message, conversationEncryptionMode: encryptionMode
              ) == .shareable,
              candidates(of: message, readers: readers)?.targets.contains(target) == true,
              let inner = SharedTranslationSeal.open(
                  binding: SharedTranslationBinding(
                      conversationId: message.conversationId,
                      messageId: message.id,
                      targetLanguage: shared.targetLanguage,
                      sourceContent: message.content
                  ),
                  key: .messageContent,
                  envelope: shared.envelope
              )
        else { return false }
        present(
            inner.text,
            target: target,
            sourceLanguage: inner.sourceLanguage,
            engineName: inner.engine,
            translationId: "shared:\(shared.id)",
            for: message,
            readers: readers,
            persisting: true
        )
        return true
    }

    // MARK: - 2. La traduction sur l'appareil

    private struct PairBatch {
        let pair: DeviceTranslationPair
        var plans: [Plan]
    }

    private struct Routing {
        var batches: [PairBatch] = []
        var unroutable: [Plan] = []
    }

    /// Traduit par tours. Un tour envoie chaque message vers le premier rang que
    /// le moteur sait faire ; ce que le moteur ne rend pas est écarté de CE rang
    /// et retenté au tour suivant sur le rang d'après. Les tours sont bornés par
    /// le nombre de langues d'un lecteur.
    private func translate(_ plans: [Plan], readers: [String], generation: Int) async {
        var pending = plans
        var failures: [String: Set<String>] = [:]
        for _ in 0..<SharedTranslationLimits.languagesMaxCount {
            guard !pending.isEmpty else { return }
            let availability = await availabilities(of: pending, readers: readers)
            guard isCurrent(generation) else { return }
            let routing = route(pending, readers: readers, availability: availability, failures: failures)
            markExhausted(routing.unroutable)
            var retry: [Plan] = []
            for batch in routing.batches {
                var engineIsSilent = false
                for start in stride(from: 0, to: batch.plans.count, by: DeviceTranslationPolicy.batchSize) {
                    let chunk = Array(batch.plans[start..<min(start + DeviceTranslationPolicy.batchSize, batch.plans.count)])
                    var texts: [String: String] = [:]
                    if !engineIsSilent {
                        let results = await engine.translate(
                            chunk.map { DeviceTranslationRequest(id: $0.message.id, text: $0.message.content) },
                            pair: batch.pair
                        )
                        guard isCurrent(generation) else { return }
                        engineIsSilent = results.isEmpty
                        texts = Dictionary(results.map { ($0.id, $0.text) }, uniquingKeysWith: { first, _ in first })
                    }
                    for plan in chunk {
                        guard let text = texts[plan.message.id], !isBlank(text) else {
                            failures[plan.message.id, default: []].insert(batch.pair.target)
                            retry.append(plan)
                            continue
                        }
                        deliver(text, for: plan, pair: batch.pair, readers: readers)
                    }
                }
            }
            pending = retry
        }
        markExhausted(pending)
    }

    /// Ce que le moteur sait faire des couples en jeu, demandé une fois par couple.
    private func availabilities(
        of plans: [Plan],
        readers: [String]
    ) async -> [DeviceTranslationPair: DeviceTranslationAvailability] {
        var known: [DeviceTranslationPair: DeviceTranslationAvailability] = [:]
        for plan in plans {
            guard let descent = candidates(of: plan.message, readers: readers) else { continue }
            for target in descent.targets {
                let pair = DeviceTranslationPair(source: descent.source, target: target)
                if known[pair] == nil { known[pair] = await engine.availability(of: pair) }
            }
        }
        return known
    }

    /// Répartit les messages par couple : le premier rang que le moteur sait faire
    /// et qui n'a pas déjà échoué pour CE message.
    private func route(
        _ plans: [Plan],
        readers: [String],
        availability: [DeviceTranslationPair: DeviceTranslationAvailability],
        failures: [String: Set<String>]
    ) -> Routing {
        var routing = Routing()
        for plan in plans {
            let failed = failures[plan.message.id] ?? []
            guard let pair = DeviceTranslationTarget.resolve(
                preferredLanguages: readers,
                originalLanguage: plan.message.originalLanguage,
                translatedLanguages: servedLanguages(of: plan.message.id),
                canTranslate: { source, target in
                    !failed.contains(target)
                        && (availability[DeviceTranslationPair(source: source, target: target)] ?? .unsupported) != .unsupported
                }
            ) else {
                routing.unroutable.append(plan)
                continue
            }
            if let index = routing.batches.firstIndex(where: { $0.pair == pair }) {
                routing.batches[index].plans.append(plan)
            } else {
                routing.batches.append(PairBatch(pair: pair, plans: [plan]))
            }
        }
        return routing
    }

    /// Montre la traduction du moteur — si elle sert encore. Pendant que
    /// l'appareil traduisait, le message a pu être édité, ou le serveur ou un
    /// autre membre servir ce rang : on relit tout avant de poser, et une
    /// traduction déjà là n'est jamais écrasée.
    private func deliver(_ text: String, for plan: Plan, pair: DeviceTranslationPair, readers: [String]) {
        markExhausted([plan])
        guard let source,
              let current = source.deviceTranslationMessages.first(where: { $0.id == plan.message.id }),
              MessageVersion(current) == plan.version,
              candidates(of: current, readers: readers)?.targets.contains(pair.target) == true
        else { return }
        let shareable = plan.disposition == .shareable
        present(
            text,
            target: pair.target,
            sourceLanguage: pair.source,
            engineName: engine.engineName,
            translationId: "device:\(current.id):\(pair.target)",
            for: current,
            readers: readers,
            persisting: shareable
        )
        if shareable {
            enqueueShare(text, target: pair.target, sourceLanguage: pair.source, for: current)
        }
    }

    /// LE site qui montre une traduction, qu'elle vienne du moteur ou d'un autre
    /// membre. Elle prend l'orthographe du rang du lecteur (`pt-BR` et non `pt`) :
    /// c'est ainsi que les surfaces de la conversation la retrouvent.
    private func present(
        _ text: String,
        target: String,
        sourceLanguage: String,
        engineName: String,
        translationId: String,
        for message: Message,
        readers: [String],
        persisting: Bool
    ) {
        applied[message.id, default: []].insert(target)
        source?.applyDeviceTranslation(
            MessageTranslation(
                id: translationId,
                messageId: message.id,
                sourceLanguage: sourceLanguage,
                targetLanguage: DeviceTranslationTarget.readerSpelling(of: target, in: readers),
                translatedContent: text,
                translationModel: engineName,
                confidenceScore: nil
            ),
            persisting: persisting
        )
    }

    // MARK: - 3. Le partage

    /// Scelle la traduction avec le texte original du message, puis la met en
    /// file. Une traduction que la passerelle refuserait (trop longue, langue mal
    /// formée) reste locale : le lecteur la voit, personne d'autre ne la reçoit.
    private func enqueueShare(_ text: String, target: String, sourceLanguage: String, for message: Message) {
        let binding = SharedTranslationBinding(
            conversationId: message.conversationId,
            messageId: message.id,
            targetLanguage: target,
            sourceContent: message.content
        )
        let inner = SharedTranslationInner(text: text, sourceLanguage: sourceLanguage, engine: engine.engineName)
        do {
            let envelope = try SharedTranslationSeal.seal(binding: binding, key: .messageContent, inner: inner)
            shareQueue.append(
                DeviceTranslationShare(
                    conversationId: message.conversationId,
                    body: ShareTranslationBody(messageId: message.id, targetLanguage: target, envelope: envelope)
                )
            )
            drainShares()
        } catch {
            Logger.deviceTranslation.info("translation kept local: \(String(describing: error), privacy: .public)")
        }
    }

    /// Une requête à la fois, dans l'ordre : un lot de vingt traductions ne doit
    /// pas devenir vingt requêtes simultanées.
    private func drainShares() {
        guard shareTask == nil, !shareQueue.isEmpty else { return }
        shareTask = Task { [weak self] in
            await self?.postQueuedShares()
        }
    }

    private func postQueuedShares() async {
        while !shareQueue.isEmpty {
            let next = shareQueue.removeFirst()
            do {
                _ = try await sharing.share(conversationId: next.conversationId, body: next.body)
            } catch {
                Logger.deviceTranslation.info("translation not shared: \(error.localizedDescription, privacy: .public)")
            }
        }
        shareTask = nil
    }

    private func isBlank(_ text: String) -> Bool {
        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

private extension Logger {
    nonisolated static let deviceTranslation = Logger(subsystem: "me.meeshy.app", category: "device-translation")
}
