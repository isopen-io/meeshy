import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Le saut vers une citation met en évidence la pièce citée (#9911)

/// **Quelle tuile le saut vers le message cité doit-il mettre en évidence ?**
///
/// Une citation qui NOMME une pièce (« répondre à la 3ᵉ photo ») mène au
/// message cité ; sans mise en évidence, l'œil cherchait la photo dans une
/// grille de sept. Une citation du message ENTIER ne nomme rien : la cellule
/// clignote seule, comme avant.
nonisolated enum QuotedPieceSpotlight {

    /// La pièce à mettre en évidence, ou `nil` : la citation doit viser CE
    /// message, être une citation de message (pas de story) et NOMMER sa pièce.
    /// `quotedPieceCount` posé dit « le message entier » — la face montre alors
    /// la première tuile sans l'avoir choisie.
    static func pieceId(of reference: ReplyReference?, jumpingTo targetId: String) -> String? {
        guard let reference, reference.messageId == targetId, !reference.isStoryReply,
              reference.quotedPieceCount == nil,
              let attachmentId = reference.attachmentId, !attachmentId.isEmpty else { return nil }
        return attachmentId
    }
}

private struct PieceSpotlightKey: EnvironmentKey {
    static let defaultValue: AnyPublisher<String, Never>? = nil
}

extension EnvironmentValues {
    /// Les identifiants de pièce que le fil met en évidence (posé par la
    /// cellule, émis quand le saut vers une citation se pose).
    var pieceSpotlight: AnyPublisher<String, Never>? {
        get { self[PieceSpotlightKey.self] }
        set { self[PieceSpotlightKey.self] = newValue }
    }
}

/// L'anneau qui s'allume sur la tuile citée, puis s'éteint. Aucun rendu tant
/// que rien n'est émis : `onReceive` ne réveille la tuile que pour SA pièce.
struct PieceSpotlightRing: ViewModifier {
    let attachmentId: String
    let accentHex: String
    @Environment(\.pieceSpotlight) private var spotlight
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isLit = false

    func body(content: Content) -> some View {
        content
            .overlay {
                RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                    .strokeBorder(Color(hex: accentHex), lineWidth: 3)
                    .shadow(color: Color(hex: accentHex).opacity(0.7), radius: 8)
                    .opacity(isLit ? 1 : 0)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
            .onReceive(spotlight ?? Empty<String, Never>().eraseToAnyPublisher()) { pieceId in
                guard pieceId == attachmentId else { return }
                light()
            }
    }

    private func light() {
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { isLit = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            withAnimation(reduceMotion ? nil : .easeIn(duration: 0.45)) { isLit = false }
        }
    }
}
