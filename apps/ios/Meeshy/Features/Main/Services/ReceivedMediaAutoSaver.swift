import Combine
import Foundation
import MeeshySDK
import MeeshyUI
import os

private let autoSaveLog = MeeshyLog.logger(.mediaAutosave)

// MARK: - La règle : quelles pièces reçues rejoignent l'album

/// **Les images et vidéos REÇUES s'enregistrent seules dans l'album « Meeshy »**
/// (#8307, directive porteur 2026-09-27) quand l'utilisateur l'a voulu — le
/// réglage est coupé par défaut (#14640) — une seule fois par pièce, jamais une
/// pièce protégée.
///
/// Un enregistrement automatique est une SORTIE : la loi de sortie décide
/// (`Message.exitOffer`, #9573 — éphémère, flamme-œil, vue unique, flou, lus sur
/// le message ET sur ses pièces). S'y ajoutent le chiffrement du message et la
/// protection de la PIÈCE (`ComposableAttachment.isProtected`, la garde des
/// menus). Le flou n'est qu'un masque de rendu : enregistrer la pièce la
/// sortirait EN CLAIR.
///
/// **Seuls les messages reçus pendant l'installation en cours** (#10370, directive
/// porteur 2026-10-12) : après une réinstallation, la synchronisation ramène tout
/// l'historique, et ses médias étaient déjà dans la photothèque — ou l'utilisateur
/// ne les y voulait pas. Un message dont la date SERVEUR précède le début de
/// l'installation n'y entre que par un « Enregistrer » exprès.
enum ReceivedMediaAutoSavePolicy {

    static func eligibleMedia(in message: Message,
                              receivedSince installationStartedAt: Date = .distantPast) -> [MessageAttachment] {
        guard !message.isMe,
              message.createdAt >= installationStartedAt,
              message.deletedAt == nil,
              !message.isEncrypted,
              message.exitOffer.offers(.save) else { return [] }
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

/// L'interrupteur « Enregistrer dans Photos » — **coupé par défaut** (#14640,
/// directive porteur). Sa seule source de vérité est la préférence
/// SERVEUR `privacy.saveMediaToGallery` : Réglages › Médias et Réglages ›
/// Confidentialité l'écrivent, l'enregistrement automatique la lit.
@MainActor
protocol ReceivedMediaAutoSaveSetting: AnyObject {
    var isEnabled: Bool { get }
}

@MainActor
final class ReceivedMediaAutoSaveUserSetting: ReceivedMediaAutoSaveSetting {
    // SE-0466 — garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = ReceivedMediaAutoSaveUserSetting()

    private let privacy: @MainActor () -> PrivacyPreferences

    init(privacy: @escaping @MainActor () -> PrivacyPreferences = { UserPreferencesManager.shared.privacy }) {
        self.privacy = privacy
    }

    var isEnabled: Bool { privacy().saveMediaToGallery }
}

/// Ce que la migration demande à la synchronisation des préférences.
@MainActor
protocol GallerySavePreferenceSyncing: AnyObject {
    /// `true` si les préférences viennent d'être relues du serveur.
    func refreshFromServer() async -> Bool
    func enableSaveToGallery()
}

@MainActor
final class UserPreferencesGallerySync: GallerySavePreferenceSyncing {
    // SE-0466 — garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    private let manager: UserPreferencesManager

    init(manager: UserPreferencesManager = .shared) {
        self.manager = manager
    }

    func refreshFromServer() async -> Bool {
        let before = manager.lastSyncDate
        await manager.fetchFromBackend()
        guard let after = manager.lastSyncDate else { return false }
        return after != before
    }

    func enableSaveToGallery() {
        manager.updatePrivacy { $0.saveMediaToGallery = true }
    }
}

/// **L'ancienne clé locale rejoint la préférence serveur, une fois** (#14640).
///
/// L'interrupteur vivait dans `UserDefaults`, vrai par défaut et jamais écrit
/// tant que l'utilisateur n'y touchait pas : une clé PRÉSENTE est donc un choix.
/// Vraie, elle pousse vrai au serveur ; fausse, elle s'oublie (le serveur est
/// déjà coupé par défaut). La catégorie part ENTIÈRE au serveur : la poussée
/// attend une relecture fraîche, sinon la clé reste pour la session suivante.
enum ReceivedMediaAutoSaveLegacyMigration {
    static let key = "meeshy.media.autoSaveReceivedToAlbum"

    @MainActor
    static func run(defaults: UserDefaults = .standard,
                    sync: GallerySavePreferenceSyncing = UserPreferencesGallerySync()) async {
        guard let chosen = defaults.object(forKey: key) as? Bool else { return }
        guard chosen else {
            defaults.removeObject(forKey: key)
            return
        }
        guard await sync.refreshFromServer() else { return }
        sync.enableSaveToGallery()
        defaults.removeObject(forKey: key)
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
            // Dédoublonnée par l'empreinte du contenu (#10370) : un média déjà dans
            // l'album n'y entre pas une seconde fois, et c'est un succès.
            let outcome = request.kind == .video
                ? await PhotoLibraryManager.shared.addVideo(at: file, alias: attachment.id)
                : await PhotoLibraryManager.shared.addImageFile(at: file, alias: attachment.id)
            return outcome.isInAlbum ? .saved : .failed
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
    private let downloadAllowed: @MainActor (MessageAttachment) -> Bool
    private let installation: AppInstallationDateProviding
    private var socketSubscription: AnyCancellable?
    /// Armé avec la SESSION (`RealtimeRelays.arm`) : hors session — un témoin,
    /// un aperçu — rien ne part vers la photothèque.
    private(set) var isActive: Bool

    init(isActive: Bool = false,
         setting: ReceivedMediaAutoSaveSetting = ReceivedMediaAutoSaveUserSetting.shared,
         registry: AutoSavedAttachmentRegistering = AutoSavedAttachmentRegistry.shared,
         writer: ReceivedMediaAlbumWriting = PhotoAlbumReceivedMediaWriter(),
         downloadAllowed: @escaping @MainActor (MessageAttachment) -> Bool = ReceivedMediaAutoSaver.networkPolicyAllows,
         installation: AppInstallationDateProviding = AppInstallationClock.shared) {
        self.isActive = isActive
        self.setting = setting
        self.registry = registry
        self.writer = writer
        self.downloadAllowed = downloadAllowed
        self.installation = installation
    }

    /// Écoute les messages reçus par le socket — une fois, au démarrage.
    func startListening(currentUserId: @escaping @MainActor () -> String?) {
        // L'instant d'installation est posé AVANT la première réception : la
        // synchronisation qui suit une réinstallation le trouve déjà là.
        _ = installation.installationStartedAt
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
        let since = installation.installationStartedAt
        let eligible = messages.flatMap { ReceivedMediaAutoSavePolicy.eligibleMedia(in: $0, receivedSince: since) }
        for attachment in eligible {
            guard downloadAllowed(attachment),
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
    /// cellulaire attend le Wi-Fi si l'utilisateur l'a demandé — sauf sous 100 Ko (#14639).
    static func networkPolicyAllows(_ attachment: MessageAttachment) -> Bool {
        MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: attachment.type == .video ? .video : .image,
            condition: NetworkConditionMonitor.shared.condition,
            prefs: MediaDownloadPreferencesStore.shared.preferences,
            byteSize: attachment.fileSize
        )
    }
}
