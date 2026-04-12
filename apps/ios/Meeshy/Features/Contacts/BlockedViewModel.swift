import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

@MainActor
final class BlockedViewModel: ObservableObject {
    @Published var blockedUsers: [BlockedUser] = []
    @Published var loadState: LoadState = .idle

    private let blockService: BlockServiceProviding

    init(blockService: BlockServiceProviding = BlockService.shared) {
        self.blockService = blockService
    }

    func loadBlocked() async {
        loadState = .loading
        do {
            blockedUsers = try await blockService.listBlockedUsers()
            loadState = .loaded
        } catch {
            loadState = .error("Erreur lors du chargement")
        }
    }

    func unblock(userId: String) async {
        let snapshot = blockedUsers
        blockedUsers.removeAll { $0.id == userId }
        HapticFeedback.medium()
        do {
            try await blockService.unblockUser(userId: userId)
            ToastManager.shared.showSuccess("Utilisateur debloque")
        } catch {
            blockedUsers = snapshot
            HapticFeedback.error()
            ToastManager.shared.showError("Impossible de debloquer")
        }
    }
}
