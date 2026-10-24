import AVFoundation
import Combine
import Foundation
import MeeshySDK

/// Ce que lit un consommateur de la politique média : la valeur du moment.
@MainActor
public protocol MediaPolicyProviding: AnyObject {
    var policy: MediaPolicy { get }
}

/// **L'observateur UNIQUE de la politique média côté lecture (#9880).**
///
/// L'état thermique n'était lu qu'au chargement d'un lecteur, et le mode
/// Économie d'énergie par aucun : un iPhone qui chauffait PENDANT la lecture
/// gardait ses tampons, sa cadence d'observateur et ses voisins préparés. Le
/// moniteur écoute les deux notifications, relit la politique, la publie
/// (`$policy`) et la REPOSE sur tout élément ou lecteur qu'on lui a remis.
///
/// - `adopt(_:role:)` applique la politique en cours et garde l'élément (ou le
///   lecteur, dont la FILE entière suit — boucles, `AVPlayerLooper`) en
///   référence FAIBLE : il suit chaque changement tant qu'il vit, et rien ne
///   le retient au-delà.
/// - Un même lecteur remis sous un autre rôle (préparé, puis affiché) change
///   de table : il suit la loi de son dernier rôle.
/// - Les notifications arrivent sur un fil arbitraire : l'observateur les
///   reçoit sur la file principale, jamais ailleurs.
@MainActor
public final class MediaPolicyMonitor: ObservableObject, MediaPolicyProviding {
    nonisolated deinit {}

    /// Le moniteur de l'app, branché sur les notifications du système.
    public static let shared: MediaPolicyMonitor = {
        let monitor = MediaPolicyMonitor(read: { MediaPolicy.live() })
        monitor.observeSystem(center: .default)
        return monitor
    }()

    @Published public private(set) var policy: MediaPolicy

    private let read: @MainActor () -> MediaPolicy
    private let watchedItems = NSHashTable<AVPlayerItem>.weakObjects()
    private let prerolledItems = NSHashTable<AVPlayerItem>.weakObjects()
    private let watchedPlayers = NSHashTable<AVPlayer>.weakObjects()
    private let prerolledPlayers = NSHashTable<AVPlayer>.weakObjects()
    private var observers: [NSObjectProtocol] = []

    public init(read: @escaping @MainActor () -> MediaPolicy) {
        self.read = read
        self.policy = read()
    }

    /// Règle `item` selon la politique en cours, et le garde à jour ensuite.
    public func adopt(_ item: AVPlayerItem, role: MediaPolicy.PlaybackRole) {
        items(for: role.other).remove(item)
        items(for: role).add(item)
        item.preferredForwardBufferDuration = policy.forwardBufferDuration(for: role)
    }

    /// Règle chaque élément de la file de `player` (l'élément courant pour un
    /// lecteur simple), et la garde à jour ensuite.
    public func adopt(_ player: AVPlayer, role: MediaPolicy.PlaybackRole) {
        players(for: role.other).remove(player)
        players(for: role).add(player)
        apply(policy, to: player, role: role)
    }

    /// Relit la politique et, si elle a changé, la publie et la repose partout.
    public func refresh() {
        let next = read()
        guard next != policy else { return }
        policy = next
        for role in [MediaPolicy.PlaybackRole.watched, .prerolled] {
            let buffer = next.forwardBufferDuration(for: role)
            items(for: role).allObjects.forEach { $0.preferredForwardBufferDuration = buffer }
            players(for: role).allObjects.forEach { apply(next, to: $0, role: role) }
        }
    }

    func observeSystem(center: NotificationCenter) {
        let names = [ProcessInfo.thermalStateDidChangeNotification, Notification.Name.NSProcessInfoPowerStateDidChange]
        observers += names.map { name in
            center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.refresh() }
            }
        }
    }

    private func apply(_ policy: MediaPolicy, to player: AVPlayer, role: MediaPolicy.PlaybackRole) {
        let buffer = policy.forwardBufferDuration(for: role)
        let queued = (player as? AVQueuePlayer)?.items() ?? []
        let elements = queued.isEmpty ? [player.currentItem].compactMap { $0 } : queued
        elements.forEach { $0.preferredForwardBufferDuration = buffer }
    }

    private func items(for role: MediaPolicy.PlaybackRole) -> NSHashTable<AVPlayerItem> {
        role == .watched ? watchedItems : prerolledItems
    }

    private func players(for role: MediaPolicy.PlaybackRole) -> NSHashTable<AVPlayer> {
        role == .watched ? watchedPlayers : prerolledPlayers
    }
}

private extension MediaPolicy.PlaybackRole {
    nonisolated var other: MediaPolicy.PlaybackRole { self == .watched ? .prerolled : .watched }
}
