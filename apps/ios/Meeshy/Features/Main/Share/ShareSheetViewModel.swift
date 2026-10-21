import Foundation
import Combine
import MeeshySDK

/// Où en est l'envoi vers UN destinataire (V6).
enum ShareDeliveryState: Equatable {
    case sending
    case sent
    /// Hors ligne : dans la file durable, partira au retour du réseau.
    case queued
    case failed(String)
}

/// **Le ViewModel de l'écran de partage unique** (#10947).
///
/// Quatre zones, toujours dans cet ordre : ce qui part, ce qu'on peut en faire,
/// à qui, puis Envoyer. Le PLAN (`SharePlanner`) décide de ce qui est offert ;
/// ce ViewModel ne relit aucun drapeau.
///
/// - Cache d'abord : les conversations, amis, contacts appariés et communautés
///   du cache s'affichent avant toute requête, puis la liste se revalide en
///   silence. Un squelette seulement quand le cache est vide.
/// - Chaque envoi rend sa ligne immédiatement (envoi, envoyé, en file, échec) ;
///   l'envoi continue si la feuille se ferme.
@MainActor
final class ShareSheetViewModel: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var subject: ShareSubject
    @Published private(set) var removedMessageIds: Set<String> = []
    @Published private(set) var conversations: [ShareRecipient] = []
    @Published private(set) var people: [ShareRecipient] = []
    @Published private(set) var communities: [ShareCommunity] = []
    @Published private(set) var channels: [String: [ShareRecipient]] = [:]
    @Published private(set) var searchResults: ShareSearchResults?
    @Published private(set) var query = ""
    @Published private(set) var selection: [ShareRecipient] = []
    @Published private(set) var publications: [PublicationTarget] = []
    @Published private(set) var deliveries: [String: ShareDeliveryState] = [:]
    @Published private(set) var loadState: LoadState = .idle
    @Published private(set) var hasSent = false
    @Published var caption = ""
    @Published var grouping: ShareGrouping = .together
    @Published var chosenDurationSeconds: Int?
    @Published var createsGroup = false

    /// La première destination servie — le toast « Envoyé à X · Ouvrir » (D5).
    private(set) var firstServed: (recipient: ShareRecipient, conversationId: String)?

    private let directory: ShareRecipientSourcing
    private let dispatcher: ShareDispatching
    private let currentUserId: () -> String
    private let presence: (String) -> PresenceState?
    /// La pièce qu'un message seul offre au studio et aux publications — la
    /// règle de l'app (`ComposableAttachment.target`) ; l'extension n'a pas de
    /// message à publier.
    private let composableAttachment: (Message) -> MessageAttachment?
    private var searchToken = 0

    static let recentsCount = 8
    static let searchMinimumLength = 2

    /// Les dépendances sont TOUTES injectées : l'app passe ses services
    /// (`ShareSheetViewModel(subject:)`, `ShareSheetHost+App.swift`),
    /// l'extension de partage les siens — aucun singleton de l'app ici.
    init(
        subject: ShareSubject,
        directory: ShareRecipientSourcing,
        dispatcher: ShareDispatching,
        currentUserId: @escaping () -> String,
        presence: @escaping (String) -> PresenceState?,
        composableAttachment: @escaping (Message) -> MessageAttachment? = { _ in nil }
    ) {
        self.subject = subject
        self.directory = directory
        self.dispatcher = dispatcher
        self.currentUserId = currentUserId
        self.presence = presence
        self.composableAttachment = composableAttachment
    }

    // MARK: - Le plan

    var plan: SharePlan {
        SharePlanner.plan(entry: subject.entry(removedMessageIds: removedMessageIds), destinations: destinations)
    }

    private var destinations: [ShareDestination] {
        selection.map(\.destination) + publications.map { ShareDestination(id: "pub:\($0.rawValue)") }
    }

    /// La pièce que les pastilles de publication DÉSIGNENT — la pièce choisie,
    /// ou l'unique pièce composable d'un message seul.
    var publishableAttachment: MessageAttachment? {
        switch subject {
        case .piece(let message, let attachmentId, _, _):
            return message.attachments.first { $0.id == attachmentId }
        case .messages(let messages, _, _):
            let kept = messages.filter { !removedMessageIds.contains($0.id) }
            guard kept.count == 1, let only = kept.first else { return nil }
            return composableAttachment(only) ?? only.attachments.first
        case .text, .link, .card, .incoming:
            return nil
        }
    }

    /// « Modifier dans le studio » a de la matière : la pièce désignée, ou ce
    /// qu'une autre app a remis (l'extension relaie la fiche au studio).
    var studioHasMatter: Bool {
        if case .incoming = subject { return true }
        return publishableAttachment != nil
    }

    /// Les publications offertes : ce que le plan permet ET que la passerelle
    /// sait publier pour cette pièce (`PublicationTargetRule`).
    var offeredPublications: [PublicationTarget] {
        guard let attachment = publishableAttachment else { return [] }
        let served = PublicationTargetRule.targets(forMimeType: attachment.mimeType)
        let order: [PublicationTarget] = [.story, .post, .reel]
        return order.filter { target in served.contains(target) && plan.offers(Self.action(for: target)) }
    }

    static func action(for target: PublicationTarget) -> ShareAction {
        switch target {
        case .story: return .publishStory
        case .post: return .publishPost
        case .reel: return .publishReel
        }
    }

    // MARK: - Les destinataires

    private var sourceConversationId: String? { subject.sourceConversationId }

    private func reachable(_ recipients: [ShareRecipient]) -> [ShareRecipient] {
        recipients.filter { $0.conversationId == nil || $0.conversationId != sourceConversationId }
    }

    var recents: [ShareRecipient] { Array(reachable(conversations).prefix(Self.recentsCount)) }

    var visibleConversations: [ShareRecipient] {
        let local = ShareRecipientMerge.matching(reachable(conversations), query: query)
        guard let searchResults else { return local }
        return ShareRecipientMerge.merge(conversations: local + reachable(searchResults.conversations), people: [])
    }

    var visiblePeople: [ShareRecipient] {
        let local = ShareRecipientMerge.matching(people, query: query)
        let found = searchResults?.people ?? []
        let merged = ShareRecipientMerge.merge(conversations: reachable(conversations), people: local + found)
        return merged.filter { $0.kind == .person }
    }

    var visibleCommunities: [ShareCommunity] {
        let local = communities.filter { query.isEmpty || $0.name.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) != nil }
        let found = searchResults?.communities ?? []
        var seen = Set<String>()
        return (local + found).filter { seen.insert($0.id).inserted }
    }

    /// Premier lancement, cache vide : le seul cas où un squelette est permis.
    var showsSkeleton: Bool { conversations.isEmpty && people.isEmpty && loadState == .loading }

    func presenceState(for recipient: ShareRecipient) -> PresenceState? {
        guard !recipient.isGroup, let userId = recipient.userId else { return nil }
        return presence(userId)
    }

    func isSelected(_ recipient: ShareRecipient) -> Bool { selection.contains { $0.id == recipient.id } }

    /// D12 : « Créer un groupe avec… » dès deux personnes cochées.
    var groupCandidates: [ShareRecipient] { selection.filter { !$0.isGroup && $0.userId != nil } }
    var offersGroupCreation: Bool { dispatcher.createsGroups && groupCandidates.count >= 2 }

    // MARK: - Chargement, cache d'abord

    func load() async {
        let userId = currentUserId()
        async let cachedConversations = directory.cachedConversations()
        async let cachedPeople = directory.cachedPeople(currentUserId: userId)
        async let cachedCommunities = directory.cachedCommunities()
        let (cached, folks, groups) = await (cachedConversations, cachedPeople, cachedCommunities)
        conversations = cached
        people = folks
        communities = groups
        loadState = conversations.isEmpty ? .loading : .cachedStale
        preselectRelayedConversations()
        await resolveCardLink()
        do {
            let fresh = try await directory.freshConversations(currentUserId: userId)
            conversations = ShareRecipientMerge.merge(conversations: fresh + conversations, people: [])
            loadState = .loaded
            preselectRelayedConversations()
        } catch {
            loadState = conversations.isEmpty ? .error(error.localizedDescription) : .offline
        }
    }

    /// Le lien suivi remplace l'adresse directe d'une story dès qu'il est
    /// prêt — l'envoi ne l'attend jamais.
    private func resolveCardLink() async {
        guard case .card(var card) = subject, let link = await dispatcher.resolvedLink(for: card) else { return }
        guard case .card = subject, !hasSent else { return }
        card.url = link
        subject = .card(card)
    }

    /// Recherche : le filtre local suit chaque frappe ; dès deux caractères, la
    /// recherche serveur (personnes, conversations, communautés) s'y fusionne.
    /// Une réponse dont le jeton n'est plus courant est rejetée en silence.
    func search(_ text: String, debounce: Duration = .milliseconds(300)) async {
        query = text
        searchToken &+= 1
        let token = searchToken
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= Self.searchMinimumLength else {
            searchResults = nil
            return
        }
        guard await cancellableSleep(for: debounce), token == searchToken else { return }
        let results = await directory.search(trimmed, currentUserId: currentUserId())
        guard token == searchToken else { return }
        searchResults = results
    }

    /// D11 : une communauté se déplie en ses canaux où l'on peut écrire.
    func toggleChannels(of community: ShareCommunity) async {
        if channels[community.id] != nil {
            channels[community.id] = nil
            return
        }
        channels[community.id] = await directory.writableChannels(of: community, currentUserId: currentUserId())
    }

    // MARK: - Choisir

    func toggle(_ recipient: ShareRecipient) {
        guard deliveries[recipient.id] == nil || deliveries[recipient.id].map(Self.isFailure) == true else { return }
        if let index = selection.firstIndex(where: { $0.id == recipient.id }) {
            selection.remove(at: index)
        } else {
            selection.append(recipient)
        }
        if !offersGroupCreation { createsGroup = false }
    }

    func togglePublication(_ target: PublicationTarget) {
        if let index = publications.firstIndex(of: target) {
            publications.remove(at: index)
        } else if offeredPublications.contains(target) {
            publications.append(target)
        }
    }

    /// La croix d'un message retire ce message de « Ce qui part ».
    func removeMessage(_ id: String) {
        guard case .messages(let messages, _, _) = subject,
              messages.filter({ !removedMessageIds.contains($0.id) }).count > 1 else { return }
        removedMessageIds.insert(id)
    }

    // MARK: - Ce qui part, venu d'une autre app (V1, V9)

    /// La croix d'une pièce la retire ; la dernière reste.
    func removeIncoming(_ id: String) {
        guard case .incoming(var incoming) = subject, incoming.media.count > 1 else { return }
        incoming.media.removeAll { $0.id == id }
        subject = .incoming(incoming)
    }

    /// « Retirer les N derniers » (V9) : ôte ce qui dépasse les plafonds communs.
    func trimOverflow() {
        let trim = plan.limits.trimCount
        guard trim > 0, case .incoming(var incoming) = subject else { return }
        incoming.media.removeLast(min(trim, max(incoming.media.count - 1, 0)))
        subject = .incoming(incoming)
    }

    /// Réordonner sans glisser — les actions d'accessibilité « Avancer » et
    /// « Reculer » de chaque pièce.
    func moveIncoming(_ id: String, by offset: Int) {
        guard case .incoming(var incoming) = subject,
              let from = incoming.media.firstIndex(where: { $0.id == id }) else { return }
        let to = from + offset
        guard incoming.media.indices.contains(to) else { return }
        incoming.media.swapAt(from, to)
        subject = .incoming(incoming)
    }

    /// Un partage relayé rouvre l'écran sur les conversations déjà choisies.
    private func preselectRelayedConversations() {
        guard case .incoming(let incoming) = subject, !incoming.preselectedConversationIds.isEmpty, selection.isEmpty else { return }
        selection = incoming.preselectedConversationIds.compactMap { id in conversations.first { $0.conversationId == id } }
    }

    /// « Tout le message » (V2) élargit la pièce sans fermer l'écran.
    func widenToWholeMessage() {
        guard let widened = subject.widenedToWholeMessage else { return }
        subject = widened
        publications = publications.filter { offeredPublications.contains($0) }
    }

    // MARK: - Envoyer

    /// Le texte que la légende prend effectivement (borné à 5 000).
    var boundedCaption: String { String(caption.prefix(ShareLimits.maxCaptionLength)) }

    func send() async {
        let plan = plan
        guard plan.canSend, !hasSent else { return }
        hasSent = true
        let request = ShareSendRequest(
            subject: subject,
            keptMessageIds: plan.kept,
            caption: plan.caption == nil ? "" : boundedCaption,
            captionPlacement: plan.caption?.placement,
            grouping: grouping,
            chosenDurationSeconds: chosenDurationSeconds ?? plan.flameMaxDurationSeconds,
            copyOnDevice: plan.encryption?.copyOnDevice == true
        )
        let grouped = createsGroup && offersGroupCreation ? groupCandidates : []
        let individual = selection.filter { recipient in !grouped.contains { $0.id == recipient.id } }
        for recipient in selection { deliveries[recipient.id] = .sending }
        for target in publications { deliveries["pub:\(target.rawValue)"] = .sending }

        if !grouped.isEmpty { await deliverToNewGroup(grouped, request: request) }
        for recipient in individual { await deliver(request, to: recipient) }
        await publishSelected()
    }

    func retry(_ recipientId: String) async {
        guard let recipient = selection.first(where: { $0.id == recipientId }),
              case .failed = deliveries[recipientId] else { return }
        deliveries[recipientId] = .sending
        let plan = plan
        await deliver(ShareSendRequest(
            subject: subject, keptMessageIds: plan.kept, caption: plan.caption == nil ? "" : boundedCaption,
            captionPlacement: plan.caption?.placement, grouping: grouping,
            chosenDurationSeconds: chosenDurationSeconds ?? plan.flameMaxDurationSeconds,
            copyOnDevice: plan.encryption?.copyOnDevice == true
        ), to: recipient)
    }

    func retryAll() async {
        for id in failedIds { await retry(id) }
    }

    var failedIds: [String] {
        selection.map(\.id).filter { deliveries[$0].map(Self.isFailure) == true }
    }

    var isFinished: Bool {
        hasSent && !deliveries.values.contains(.sending)
    }

    private func deliver(_ request: ShareSendRequest, to recipient: ShareRecipient) async {
        let outcome = await dispatcher.deliver(request, to: recipient)
        record(outcome, for: [recipient.id], served: recipient)
    }

    private func deliverToNewGroup(_ people: [ShareRecipient], request: ShareSendRequest) async {
        guard let group = await dispatcher.createGroup(with: people) else {
            let reason = String(localized: "share.group.failed", defaultValue: "Le groupe n’a pas pu être créé", bundle: .meeshyShare)
            for person in people { deliveries[person.id] = .failed(reason) }
            return
        }
        let outcome = await dispatcher.deliver(request, to: group)
        record(outcome, for: people.map(\.id), served: group)
    }

    private func record(_ outcome: ShareDeliveryOutcome, for ids: [String], served recipient: ShareRecipient) {
        let state: ShareDeliveryState
        switch outcome {
        case .sent(let conversationId):
            state = .sent
            if firstServed == nil { firstServed = (recipient, conversationId) }
        case .queued(let conversationId):
            state = .queued
            if firstServed == nil { firstServed = (recipient, conversationId) }
        case .failed(let reason):
            state = .failed(reason)
        }
        for id in ids { deliveries[id] = state }
    }

    private func publishSelected() async {
        guard let attachment = publishableAttachment else { return }
        for target in publications {
            let published = await dispatcher.publish(attachment: attachment, to: target)
            deliveries["pub:\(target.rawValue)"] = published
                ? .sent
                : .failed(String(localized: "forward.publish-failed", defaultValue: "La publication a échoué", bundle: .meeshyShare))
        }
    }

    private static func isFailure(_ state: ShareDeliveryState) -> Bool {
        if case .failed = state { return true }
        return false
    }
}
