import Foundation
import MeeshySDK

/// Les collaborateurs que `ConversationViewModel` délègue : un seul agrégat
/// injecté, jamais un paramètre d'init de plus par collaborateur. Chaque champ
/// a son défaut vivant ; un test en remplace un seul.
struct ConversationCollaborators {
    let readReceipts: any ConversationReadReceiptSenderProviding
    let voiceConsent: any VoiceConsentGateProviding
    let cacheReader: any ConversationCacheReaderProviding
    let windowFetcher: any ConversationWindowFetcherProviding
    let stager: any OptimisticMessageStagerProviding
    let failureRecovery: any SendFailureRecoveryProviding
    /// Le régime appris APRÈS l'ouverture du fil (#11379).
    let regimeLedger: EndToEndRegimeLedger
    /// Le régime relu à la passerelle quand elle dit qu'il a changé (#12522).
    let encryptionService: any ConversationEncryptionServiceProviding
    let regimeRefresher: EndToEndRegimeRefresher

    init(
        persistence: MessagePersistenceActor,
        syncEngine: ConversationSyncEngineProviding,
        messageService: MessageServiceProviding,
        readReceipts: (any ConversationReadReceiptSenderProviding)? = nil,
        voiceConsent: (any VoiceConsentGateProviding)? = nil,
        cacheReader: (any ConversationCacheReaderProviding)? = nil,
        windowFetcher: (any ConversationWindowFetcherProviding)? = nil,
        stager: (any OptimisticMessageStagerProviding)? = nil,
        failureRecovery: (any SendFailureRecoveryProviding)? = nil,
        regimeLedger: EndToEndRegimeLedger? = nil,
        encryptionService: (any ConversationEncryptionServiceProviding)? = nil
    ) {
        self.readReceipts = readReceipts ?? ConversationReadReceiptSender(syncEngine: syncEngine)
        self.voiceConsent = voiceConsent ?? VoiceConsentGate()
        self.cacheReader = cacheReader ?? ConversationCacheReader()
        self.windowFetcher = windowFetcher ?? ConversationWindowFetcher(messageService: messageService, persistence: persistence)
        self.stager = stager ?? OptimisticMessageStager(persistence: persistence)
        self.failureRecovery = failureRecovery ?? SendFailureRecovery()
        self.regimeLedger = regimeLedger ?? Self.defaultRegimeLedger
        self.encryptionService = encryptionService ?? ConversationEncryptionService.shared
        self.regimeRefresher = EndToEndRegimeRefresher(ledger: self.regimeLedger, service: self.encryptionService)
    }

    /// Le registre quand l'appelant n'en injecte pas (#13211) : `.shared` en
    /// production ; un registre NEUF et ÉPHÉMÈRE sous le harnais de test —
    /// jamais `.shared`, le singleton process-wide et MONOTONE
    /// d'`EndToEndRegimeMemory.shared`. Sans cette distinction, deux suites
    /// qui construisent chacune un `ConversationViewModel` sans préciser de
    /// `regimeLedger` partagent, par ce même défaut, un registre qui
    /// n'oublie jamais : la première à apprendre une conversation chiffrée la
    /// scelle pour toutes les autres qui réutilisent son identifiant — y
    /// compris un simulateur local déjà utilisé, où `EndToEndRegimeMemory
    /// .shared` a persisté la marque dans de vraies `UserDefaults` d'un run
    /// précédent. Même garde que `AppDatabase.shared` pose pour le magasin
    /// GRDB (#6857) : une mémoire éphémère n'a rien à oublier.
    private static var defaultRegimeLedger: EndToEndRegimeLedger {
        AppDatabase.runsUnderTestHarness(environment: ProcessInfo.processInfo.environment)
            ? EndToEndRegimeLedger()
            : .shared
    }
}
