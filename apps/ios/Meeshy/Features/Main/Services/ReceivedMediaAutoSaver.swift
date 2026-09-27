import Combine
import Foundation
import MeeshySDK
import MeeshyUI
import os

private let autoSaveLog = Logger(subsystem: "me.meeshy.app", category: "media-autosave")

// MARK: - La règle : quelles pièces reçues rejoignent l'album

/// **Les images et vidéos REÇUES s'enregistrent seules dans l'album « Meeshy »**
/// (#8307, directive porteur 2026-09-27) — une seule fois par pièce, jamais une
/// pièce protégée.
///
/// La protection se lit aux deux niveaux qui la déclarent : le MESSAGE
/// (éphémère, flamme-œil, flou, vue unique, chiffré) et la PIÈCE
/// (`ComposableAttachment.isProtected`, la garde des menus). Le
/// flou n'est qu'un masque de rendu : enregistrer la pièce la sortirait EN CLAIR.
enum ReceivedMediaAutoSavePolicy {

    static let protectingFlags: MessageEffectFlags = [.ephemeral, .ephemeralAfterRead, .blurred, .viewOnce]

    static func eligibleMedia(in message: Message) -> [MessageAttachment] {
        guard !message.isMe,
              message.deletedAt == nil,
              !message.isEncrypted,
              !message.isBlurred,
              !message.isViewOnce,
              message.expiresAt == nil,
              (message.effects.ephemeralDuration ?? 0) <= 0,
              message.effects.flags.isDisjoint(with: protectingFlags) else { return [] }
        return message.attachments.filter { attachment in
            (attachment.type == .image || attachment.type == .video)
                && !ComposableAttachment.isProtected(attachment)
                && !attachment.fileUrl.isEmpty
        }
    }

    static func kind(of attachment: MessageAttachment) -> AttachmentKind {
        attachment.type == .video ? .video : .image
    }
}

// MARK: - Seams

/// L'interrupteur « Enregistrer dans Photos » de Réglages › Médias — actif par défaut.
protocol ReceivedMediaAutoSaveSetting: AnyObject {
    var isEnabled: Bool { get }
}

final class ReceivedMediaAutoSaveUserSetting: ReceivedMediaAutoSaveSetting {
    // SE-0466 — garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = ReceivedMediaAutoSaveUserSetting()
    static let key = "meeshy.media.autoSaveReceivedToAlbum"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var isEnabled: Bool {
        defaults.object(forKey: Self.key) as? Bool ?? true
    }
}

/// Le registre des pièces DÉJÀ enregistrées — une photo reçue n'entre qu'une
/// fois dans l'album, quel que soit le chemin (socket, ouverture) qui la revoit.
protocol AutoSavedAttachmentRegistering: AnyObject {
    /// `true` si la pièce n'était pas encore réservée — elle l'est désormais.
    func claim(_ attachmentId: String) -> Bool
    func release(_ attachmentId: String)
}

final class AutoSavedAttachmentRegistry: AutoSavedAttachmentRegistering {
    // SE-0466 — garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = AutoSavedAttachmentRegistry()
    private static let key = "meeshy.media.autoSavedAttachmentIds.v1"
    /// Borne : au-delà, les plus anciennes sortent — une pièce aussi ancienne
    /// ne reviendra plus par la réception.
    private static let capacity = 4000

    private let defaults: UserDefaults
    private var ids: [String]
    private var index: Set<String>

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let stored = defaults.stringArray(forKey: Self.key) ?? []
        self.ids = stored
        self.index = Set(stored)
    }

    func claim(_ attachmentId: String) -> Bool {
        guard index.insert(attachmentId).inserted else { return false }
        ids.append(attachmentId)
        if ids.count > Self.capacity {
            let overflow = ids.prefix(ids.count - Self.capacity)
            overflow.forEach { index.remove($0) }
            ids.removeFirst(overflow.count)
        }
        defaults.set(ids, forKey: Self.key)
        return true
    }

    func release(_ attachmentId: String) {
        guard index.remove(attachmentId) != nil else { return }
        ids.removeAll { $0 == attachmentId }
        defaults.set(ids, forKey: Self.key)
    }
}

enum ReceivedMediaSaveOutcome: Equatable {
    case saved
    /// Accès Photos refusé : dégradation SILENCIEUSE, la pièce reste réservée —
    /// aucune boucle de demande.
    case denied
    /// Échec passager (téléchargement) : la pièce est rendue au registre.
    case failed
}

/// L'écriture dans l'album — téléchargement compris.
protocol ReceivedMediaAlbumWriting: Sendable {
    func save(_ attachment: MessageAttachment) async -> ReceivedMediaSaveOutcome
}

struct PhotoAlbumReceivedMediaWriter: ReceivedMediaAlbumWriting {
    func save(_ attachment: MessageAttachment) async -> ReceivedMediaSaveOutcome {
        switch PhotoLibraryManager.shared.authorizationState {
        case .denied, .restricted:
            return .denied
        case .notDetermined, .granted, .limited:
            break
        }
        // Une seule demande possible : le système ne repropose jamais après un refus.
        guard await PhotoLibraryManager.shared.requestAuthorization() else { return .denied }
        let request = MediaSaveRequest(kind: ReceivedMediaAutoSavePolicy.kind(of: attachment), origin: .transmitted,
                                       remoteURLString: attachment.fileUrl, attachmentId: attachment.id)
        do {
            let file = try await AttachmentMediaSaveResolver().resolveLocalFile(for: request)
            let saved = request.kind == .video
                ? await PhotoLibraryManager.shared.saveVideo(at: file)
                : await PhotoLibraryManager.shared.saveImage(try Data(contentsOf: file))
            return saved ? .saved : .failed
        } catch {
            return .failed
        }
    }
}

// MARK: - L'orchestrateur

@MainActor
protocol ReceivedMediaAutoSaving: AnyObject {
    func consider(_ messages: [Message])
}

/// **Quand** enregistrer : à la RÉCEPTION — le message arrivé par le socket, et
/// ceux que l'ouverture d'une conversation accuse reçus. La règle « quand »
/// vit ici, côté app ; le SDK ne fournit que l'album (`PhotoLibraryManager`).
@MainActor
final class ReceivedMediaAutoSaver: ReceivedMediaAutoSaving {
    // SE-0466 — garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = ReceivedMediaAutoSaver()

    private let setting: ReceivedMediaAutoSaveSetting
    private let registry: AutoSavedAttachmentRegistering
    private let writer: ReceivedMediaAlbumWriting
    private let downloadAllowed: @MainActor (AttachmentKind) -> Bool
    private var socketSubscription: AnyCancellable?
    /// Armé avec la SESSION (`RealtimeRelays.arm`) : hors session — un témoin,
    /// un aperçu — rien ne part vers la photothèque.
    private(set) var isActive: Bool

    init(isActive: Bool = false,
         setting: ReceivedMediaAutoSaveSetting = ReceivedMediaAutoSaveUserSetting.shared,
         registry: AutoSavedAttachmentRegistering = AutoSavedAttachmentRegistry.shared,
         writer: ReceivedMediaAlbumWriting = PhotoAlbumReceivedMediaWriter(),
         downloadAllowed: @escaping @MainActor (AttachmentKind) -> Bool = ReceivedMediaAutoSaver.networkPolicyAllows) {
        self.isActive = isActive
        self.setting = setting
        self.registry = registry
        self.writer = writer
        self.downloadAllowed = downloadAllowed
    }

    /// Écoute les messages reçus par le socket — une fois, au démarrage.
    func startListening(currentUserId: @escaping @MainActor () -> String?) {
        isActive = true
        guard socketSubscription == nil else { return }
        socketSubscription = MessageSocketManager.shared.messageReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] api in
                Task { @MainActor [weak self] in
                    guard let self, let me = currentUserId() else { return }
                    self.consider([api.toMessage(currentUserId: me)])
                }
            }
    }

    func consider(_ messages: [Message]) {
        guard isActive, setting.isEnabled else { return }
        for attachment in messages.flatMap(ReceivedMediaAutoSavePolicy.eligibleMedia) {
            guard downloadAllowed(ReceivedMediaAutoSavePolicy.kind(of: attachment)),
                  registry.claim(attachment.id) else { continue }
            let writer = writer
            Task { @MainActor [weak self] in
                let outcome = await writer.save(attachment)
                if outcome == .failed { self?.registry.release(attachment.id) }
                autoSaveLog.info("autosave att=\(attachment.id, privacy: .public) outcome=\(String(describing: outcome), privacy: .public)")
            }
        }
    }

    /// La politique réseau existante (Réglages › Médias) : une vidéo sur réseau
    /// cellulaire attend le Wi-Fi si l'utilisateur l'a demandé.
    static func networkPolicyAllows(_ kind: AttachmentKind) -> Bool {
        MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: kind == .video ? .video : .image,
            condition: NetworkConditionMonitor.shared.condition,
            prefs: MediaDownloadPreferencesStore.shared.preferences
        )
    }
}
