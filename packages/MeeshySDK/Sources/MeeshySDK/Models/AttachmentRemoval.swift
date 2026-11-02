import Foundation

/// Ce que le retrait d'UNE pièce (`attachment:deleted`) laisse du message. Un seul prédicat pour la base, le cache
/// des messages et l'aperçu de la liste : trois copies d'une même règle finissent par se contredire.
public enum AttachmentRemoval {

    /// Plus ni texte ni pièce : la bulle devient une pierre tombale, comme la suppression locale de la dernière pièce.
    /// Un message chiffré de bout en bout n'est jamais jugé vide ici : son texte est au coffre, pas dans la ligne.
    public static func leavesNothing(text: String?, isEncrypted: Bool, remaining: Int) -> Bool {
        guard remaining == 0, !isEncrypted else { return false }
        return text?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true
    }
}

/// Le sort d'un message après le retrait d'une pièce, tel que la base le rend.
public enum AttachmentRemovalOutcome: Sendable, Equatable {
    case unchanged
    case removed
    case tombstoned
}
