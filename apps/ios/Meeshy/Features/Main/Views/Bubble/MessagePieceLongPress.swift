import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - L'appui long d'une TUILE vise CETTE pièce (#9907)
//
// Directive porteur du 2026-10-10 : « l'appui long sur une pièce d'un message à
// plusieurs pièces montre CETTE pièce seule, avec un défilement vers les autres
// pièces du message ». La tuile ne connaît ni le menu ni la conversation : elle
// remonte l'identifiant de la pièce par l'environnement, que la cellule du fil
// pose avec l'identifiant du message déjà résolu. Bulles, Focal et Script lisent
// la MÊME clé — un geste, un effet, quel que soit le mode de lecture.

private struct MessagePieceLongPressKey: EnvironmentKey {
    static let defaultValue: ((String) -> Void)? = nil
}

extension EnvironmentValues {
    /// Ouvre l'aperçu d'appui long sur la pièce dont l'identifiant est remis.
    /// `nil` hors du fil (aperçu, export, mode sélection) : la tuile garde alors
    /// l'appui long de son hôte, qui vise le message entier.
    var messagePieceLongPress: ((String) -> Void)? {
        get { self[MessagePieceLongPressKey.self] }
        set { self[MessagePieceLongPressKey.self] = newValue }
    }
}

/// **L'appui long d'une tuile.** Prioritaire sur celui de la bulle — qui, lui,
/// ouvre l'aperçu du message entier — seulement quand `enabled` : une pièce
/// seule ou protégée laisse la pression à son hôte.
///
/// La même porte est offerte à VoiceOver par une action nommée : sans elle,
/// l'aperçu d'une pièce serait réservé à qui peut presser une tuile.
struct MessagePieceLongPress: ViewModifier {
    let attachmentId: String
    let enabled: Bool
    @Environment(\.messagePieceLongPress) private var open

    func body(content: Content) -> some View {
        if enabled, let open {
            content
                .highPriorityGesture(
                    LongPressGesture(minimumDuration: 0.4).onEnded { _ in
                        HapticFeedback.medium()
                        open(attachmentId)
                    }
                )
                .accessibilityAction(named: Text(String(localized: "message.piece.a11y.options", defaultValue: "Options de cette pièce", bundle: .main))) {
                    open(attachmentId)
                }
        } else {
            content
        }
    }
}
