import Foundation
import MeeshySDK
import os

/// Ce qui rescelle, dans la base des messages, les lignes des messages chiffrés de bout en bout.
nonisolated protocol EndToEndPlaintextRowSealing: Sendable {
    func seal(messageKeys: [String]) async throws -> EndToEndPlaintextRowSealer.Outcome
}

/// **Le clair qu'une version antérieure a écrit hors du coffre s'en va** (#12999).
///
/// Avant ce correctif, mon envoi chiffré de bout en bout laissait son texte dans
/// la ligne GRDB (gardé à l'écho du serveur), dans l'aperçu de la liste, dans
/// le cache du fil (avec le clair déchiffré des pairs), dans un brouillon et
/// dans un favori. Modèle : appareil volé. Le coffre libsignal sait quels
/// messages sont chiffrés de bout en bout — ceux dont il tient le clair — : leur
/// ligne est rescellée, l'aperçu qui les nomme aussi, et les caches d'une
/// conversation chiffrée sont vidés (ils se reconstruisent). Une fois par
/// compte, à l'ouverture de sa session, quand le coffre est le sien.
struct EndToEndDiskPlaintextMigration: Sendable {
    static let doneKeyPrefix = "e2ee.diskPlaintextSealed.v1."

    let endToEnd: any EndToEndMessagingProviding
    let rows: @MainActor @Sendable () -> any EndToEndPlaintextRowSealing
    var caches: CacheCoordinator = .shared
    var drafts: DraftStore = .shared
    var defaults: UserDefaults = .standard
    var starred: @MainActor @Sendable () -> StarredMessagesStore = { .shared }
    var searchIndex: SearchIndex = .shared

    func run(for account: String) async {
        let doneKey = Self.doneKeyPrefix + account
        guard !account.isEmpty, !defaults.bool(forKey: doneKey),
              let sealedIds = await endToEnd.storedMessageIds(as: account) else { return }
        do {
            let rescued = try await rows().seal(messageKeys: sealedIds)
            let endToEndConversations = await resealListPreviews(naming: Set(sealedIds)).union(rescued.conversationIds)
            for id in endToEndConversations {
                await caches.messages.invalidate(for: id)
                await caches.conversationMedia.invalidate(for: id)
                drafts.remove(for: id)
            }
            await resealStarred(Set(sealedIds))
            defaults.set(true, forKey: doneKey)
            Logger.e2ee.info("e2ee disk plaintext sealed rows=\(rescued.rows, privacy: .public) conversations=\(endToEndConversations.count, privacy: .public)")
        } catch {
            Logger.e2ee.error("e2ee disk plaintext migration deferred: \(String(describing: type(of: error)), privacy: .public)")
        }
    }

    /// Rescelle l'aperçu de chaque ligne dont le dernier message est au coffre,
    /// et rend les conversations chiffrées de bout en bout de la liste.
    private func resealListPreviews(naming sealedIds: Set<String>) async -> Set<String> {
        let cached = await caches.conversations.loadIgnoringExpiry(for: "list")?.items ?? []
        await caches.conversations.update(for: "list") { conversations in
            conversations.map { conversation in
                guard let last = conversation.lastMessageId, sealedIds.contains(last) else { return conversation }
                var sealed = conversation
                sealed.applyLastMessage(LastMessageFacet(conversation: conversation).sealedForEndToEnd(true))
                return sealed
            }
        }
        let resealed = await caches.conversations.loadIgnoringExpiry(for: "list")?.items ?? []
        await searchIndex.indexConversations(resealed)
        await searchIndex.compactConversations()
        return Set(cached
            .filter { EndToEndPlaintextLaw.isEndToEndConversation($0.encryptionMode)
                || $0.lastMessageId.map(sealedIds.contains) == true }
            .map(\.id))
    }

    @MainActor
    private func resealStarred(_ sealedIds: Set<String>) {
        let store = starred()
        store.snapshots
            .filter { sealedIds.contains($0.id) }
            .forEach { store.updatePreview(messageId: $0.id, contentPreview: StarredSnapshotFactory.sealedPreview) }
    }
}

extension EndToEndPlaintextRowSealer: EndToEndPlaintextRowSealing {}
