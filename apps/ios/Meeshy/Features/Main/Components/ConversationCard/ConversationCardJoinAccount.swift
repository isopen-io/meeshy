import Foundation
import MeeshySDK

/// Le compte au nom duquel « Rejoindre » agit, tel que le bouton le NOMME
/// (correction porteur 2026-09-29, #8726) : le nom d'affichage, comme partout
/// où l'app nomme l'utilisateur connecté (`displayName ?? username`), sinon son
/// pseudo. `handle` sert à VoiceOver (« Rejoindre avec le compte @pseudo »).
nonisolated struct ConversationCardJoinAccount: Equatable {
    let title: String
    let handle: String?

    /// `nil` ⇒ le bouton garde le libellé générique « Mon compte » : aucun
    /// nom à montrer, ou une session invitée, qui n'a pas de compte à engager.
    static func resolve(displayName: String?, username: String?, isAnonymous: Bool) -> ConversationCardJoinAccount? {
        guard !isAnonymous else { return nil }
        let handle = username.flatMap { name -> String? in
            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : "@\(trimmed)"
        }
        let name = displayName?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let title = (name?.isEmpty == false ? name : nil) ?? handle else { return nil }
        return ConversationCardJoinAccount(title: title, handle: handle)
    }

    @MainActor
    static func current() -> ConversationCardJoinAccount? {
        guard let user = AuthManager.shared.currentUser else { return nil }
        return resolve(displayName: user.displayName, username: user.username, isAnonymous: user.isAnonymous == true)
    }
}
