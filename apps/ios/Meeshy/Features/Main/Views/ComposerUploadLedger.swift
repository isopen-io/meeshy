import Foundation
import Combine
import MeeshySDK

/// Les lots de pièces jointes EN VOL d'un compositeur de conversation (#14696).
///
/// Un lot se téléverse pendant que l'utilisateur compose et envoie la suite :
/// plusieurs lots vivent donc ensemble, et chacun ne rend, en finissant, que ce
/// qui lui appartient — jamais l'état partagé du compositeur, où vivent déjà
/// les pièces du message suivant.
struct ComposerUploadLedger {
    private var order: [UUID] = []
    private var owned: [UUID: Set<String>] = [:]

    var isUploading: Bool { !order.isEmpty }
    var inFlightCount: Int { order.count }

    mutating func begin(_ batch: UUID, mediaIds: Set<String>) {
        guard owned[batch] == nil else { return }
        order.append(batch)
        owned[batch] = mediaIds
    }

    /// Rend les identifiants des pièces que ce lot possédait ; un lot inconnu
    /// ou déjà terminé ne rend rien.
    mutating func finish(_ batch: UUID) -> Set<String> {
        guard let released = owned.removeValue(forKey: batch) else { return [] }
        order.removeAll { $0 == batch }
        return released
    }

    static func remaining(_ files: [String: URL], releasing released: Set<String>) -> [String: URL] {
        files.filter { !released.contains($0.key) }
    }

    /// Le brouillon durable ne se purge que si le compositeur ne porte plus
    /// aucune pièce, prête ou en préparation.
    static func purgesDraft(pendingAttachmentCount: Int, preparingCount: Int) -> Bool {
        pendingAttachmentCount == 0 && preparingCount == 0
    }
}

extension ConversationComposerState {
    /// Termine un lot : seuls ses fichiers quittent le compositeur, car ce qu'il porte APRÈS
    /// le tap appartient au message suivant. Rend `true` quand le brouillon durable peut se
    /// purger.
    mutating func settleUpload(_ upload: UUID) -> Bool {
        let released = uploads.finish(upload)
        pendingMediaFiles = ComposerUploadLedger.remaining(pendingMediaFiles, releasing: released)
        return ComposerUploadLedger.purgesDraft(
            pendingAttachmentCount: pendingAttachments.count,
            preparingCount: preparingAttachments.count
        )
    }
}

/// La progression de téléversement d'UNE bulle optimiste (#14702), observée par la seule
/// pastille de cette bulle : un tick ne redessine ni la liste, ni la bulle, ni ses voisines.
/// Elle ne republie qu'au point de pourcentage gagné, jamais à chaque tronçon TUS.
@MainActor
final class MessageUploadProgress: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var percent: Int?

    fileprivate func report(_ fraction: Double) {
        let next = Self.percent(of: fraction)
        guard next != percent else { return }
        percent = next
    }

    fileprivate func clear() {
        guard percent != nil else { return }
        percent = nil
    }

    nonisolated static func percent(of fraction: Double) -> Int {
        Int((min(max(fraction, 0), 1) * 100 + 1e-9).rounded(.down))
    }

    /// Le plus large libellé possible : le pied de bulle en réserve la largeur.
    nonisolated static func reservedLabel(locale: Locale = .current) -> String {
        accessibilityValue(percent: 100, locale: locale)
    }

    nonisolated static func accessibilityValue(percent: Int, locale: Locale = .current) -> String {
        (Double(percent) / 100).formatted(.percent.precision(.fractionLength(0)).locale(locale))
    }
}

/// Le `clientMessageId` d'une bulle → sa progression, pour TOUTE l'application (#14702, #16275) :
/// le téléversement survit à la conversation qui l'a lancé, et la bulle rouverte retrouve son
/// anneau. Le tempId d'une bulle optimiste EST son `clientMessageId`.
///
/// La cellule d'une bulle en attente se configure avant que la file durable ne la reprenne, et
/// rien ne la reconfigure ensuite : elle reçoit donc dès sa configuration l'objet que la reprise
/// nourrira. Seul ce qui monte est tenu ici ; le reste n'y vit qu'autant qu'une cellule le tient.
@MainActor
final class MessageUploadProgressStore {
    nonisolated deinit {}

    static let shared = MessageUploadProgressStore()

    private var entries: [String: MessageUploadProgress] = [:]
    private let handedOut = NSMapTable<NSString, MessageUploadProgress>.strongToWeakObjects()

    func begin(_ tempIds: [String]) {
        tempIds.filter { entries[$0] == nil }.forEach { entries[$0] = object(for: $0) }
    }

    func progress(for tempId: String) -> MessageUploadProgress? {
        if let entry = entries[tempId] { return entry }
        return ClientMessageId.isValid(tempId) ? object(for: tempId) : nil
    }

    func report(_ fraction: Double, for tempId: String) {
        entries[tempId]?.report(fraction)
    }

    func report(sent: Int64, total: Int64, for tempId: String) {
        guard total > 0 else { return }
        report(Double(sent) / Double(total), for: tempId)
    }

    /// Une bulle qui n'envoie plus ne garde pas un anneau figé : la cellule revient à l'horloge.
    func end(_ tempIds: [String]) {
        tempIds.forEach { entries.removeValue(forKey: $0)?.clear() }
    }

    private func object(for tempId: String) -> MessageUploadProgress {
        let key = tempId as NSString
        if let held = handedOut.object(forKey: key) { return held }
        let progress = MessageUploadProgress()
        handedOut.setObject(progress, forKey: key)
        return progress
    }
}

/// La reprise d'un envoi par la file durable publie sa progression sous le même identifiant que
/// l'envoi en direct (#16275) : c'est le cas de la grosse vidéo sur un réseau lent.
@MainActor
final class ReplayUploadProgressRelay {
    nonisolated deinit {}

    static let shared = ReplayUploadProgressRelay(store: .shared)

    private let store: MessageUploadProgressStore
    private var watches: [String: AnyCancellable] = [:]

    init(store: MessageUploadProgressStore) {
        self.store = store
    }

    /// Le téléverseur d'un rejeu, son lot déclaré d'emblée : les pistes montent l'une après
    /// l'autre, et la bulle oscillerait à 100 % à chaque fin de piste.
    func uploader(baseURL: URL, for cmid: String, stored paths: [String]) async -> TusUploadManager {
        let uploader = TusUploadManager(baseURL: baseURL)
        watch(uploader.progressPublisher, for: cmid)
        await uploader.setExpectedBatch(totalFiles: paths.count, totalBytes: Self.totalBytes(of: paths))
        return uploader
    }

    /// `begin` à chaque tronçon : un groupe en échec rejoint la file pendant que le reste de son
    /// lot monte encore, et la fin de ce lot ne fait pas taire la reprise déjà partie.
    func watch(_ progress: AnyPublisher<UploadQueueProgress, Never>, for cmid: String) {
        store.begin([cmid])
        let store = self.store
        watches[cmid] = progress
            .receive(on: DispatchQueue.main)
            .sink { tick in
                store.begin([cmid])
                store.report(sent: tick.uploadedBytes, total: tick.totalBytes, for: cmid)
            }
    }

    func stop(_ cmid: String) {
        watches[cmid] = nil
        store.end([cmid])
    }

    private static func totalBytes(of paths: [String]) -> Int64 {
        paths.reduce(Int64(0)) { total, stored in
            let path = OfflineQueue.absoluteMediaPath(forStored: stored)
            let size = (try? FileManager.default.attributesOfItem(atPath: path))?[.size] as? Int64
            return total + (size ?? 0)
        }
    }
}
