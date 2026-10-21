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

    init(
        persistence: MessagePersistenceActor,
        syncEngine: ConversationSyncEngineProviding,
        messageService: MessageServiceProviding,
        readReceipts: (any ConversationReadReceiptSenderProviding)? = nil,
        voiceConsent: (any VoiceConsentGateProviding)? = nil,
        cacheReader: (any ConversationCacheReaderProviding)? = nil,
        windowFetcher: (any ConversationWindowFetcherProviding)? = nil,
        stager: (any OptimisticMessageStagerProviding)? = nil
    ) {
        self.readReceipts = readReceipts ?? ConversationReadReceiptSender(syncEngine: syncEngine)
        self.voiceConsent = voiceConsent ?? VoiceConsentGate()
        self.cacheReader = cacheReader ?? ConversationCacheReader()
        self.windowFetcher = windowFetcher ?? ConversationWindowFetcher(messageService: messageService, persistence: persistence)
        self.stager = stager ?? OptimisticMessageStager(persistence: persistence)
    }
}
