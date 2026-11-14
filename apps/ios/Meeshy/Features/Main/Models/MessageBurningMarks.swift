import Foundation
import MeeshySDK

// MARK: - La combustion en cours survit à une relecture du magasin (#8382, #17938)

extension Array where Element == Message {

    /// Repose `isBurning` sur les messages dont l'hôte sait qu'ils brûlent :
    /// une écriture GRDB pendant la combustion relit la ligne sans ce drapeau,
    /// et sans ce rappel la flamme repartirait de zéro — ou s'éteindrait.
    /// `burning` est le registre de l'hôte (`ConversationViewModel.burningEphemeralIds`).
    func markingBurning(_ burning: [String: Bool]) -> [Message] {
        guard !burning.isEmpty else { return self }
        return map { message in
            guard burning[message.id] == true, !message.isBurning else { return message }
            var marked = message
            marked.isBurning = true
            return marked
        }
    }
}
