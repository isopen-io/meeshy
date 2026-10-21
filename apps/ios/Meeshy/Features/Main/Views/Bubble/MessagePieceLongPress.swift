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

/// **L'appui long d'une tuile.** Il passe avant celui de la bulle — qui, lui,
/// ouvre l'aperçu du message entier — seulement quand `enabled` : une pièce
/// seule ou protégée laisse la pression à son hôte.
///
/// **Simultané, jamais `highPriorityGesture`** (#10800) : prioritaire, il
/// retenait le simple toucher de la tuile, qui n'ouvrait plus son plein écran
/// (mesuré au simulateur iOS 17.5). Il passe avant la rangée par sa DURÉE,
/// plus courte, et par la réservation `MessagePressClaim`, que l'appui de la
/// rangée lit avant de rien faire.
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
                .simultaneousGesture(
                    LongPressGesture(minimumDuration: MessagePressClaim.pieceMinimumDuration).onEnded { _ in
                        MessagePressClaim.claim()
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

/// **Qui possède la pression en cours : la tuile ou la rangée** (#10800).
///
/// Les deux appuis longs sont simultanés — c'est ce qui laisse passer le
/// simple toucher. La tuile part la première (durée plus courte) et réserve
/// la pression ; la rangée, qui part un instant après sur le MÊME doigt, lit
/// la réservation et s'efface : un seul aperçu, une seule vibration.
@MainActor
enum MessagePressClaim {
    static let pieceMinimumDuration: TimeInterval = 0.3
    static let rowMinimumDuration: TimeInterval = 0.35
    /// Assez pour couvrir l'écart des deux durées, trop court pour avaler
    /// l'appui suivant.
    static let window: TimeInterval = 0.3

    private static var claimedAt: Date?
    private(set) static var claimedBy: Claimant?

    /// Qui réclame la pression. Chaque réclamant détient UN effet : la tuile
    /// l'aperçu de sa pièce, l'avatar le menu du profil. La rangée, elle, ne
    /// réclame jamais — elle s'efface devant tous.
    enum Claimant {
        case piece
        case avatar
    }

    static func claim(_ claimant: Claimant = .piece, at now: Date = Date()) {
        claimedAt = now
        claimedBy = claimant
    }

    static func isClaimed(at now: Date = Date()) -> Bool {
        guard let claimedAt else { return false }
        let elapsed = now.timeIntervalSince(claimedAt)
        return elapsed >= 0 && elapsed < window
    }
}

/// **L'avatar du pied réclame l'appui long** : son menu (« Voir le profil ») est
/// l'unique effet de ce geste, le menu de la rangée (« Répondre »…) ne s'ouvre
/// pas. Simultané comme la tuile, pour laisser passer le simple toucher ; la
/// réclamation précède la rangée par sa durée plus courte. Sans menu d'avatar,
/// rien ne réclame : la pression revient à la rangée.
struct MessageAvatarPressClaim: ViewModifier {
    let hasMenu: Bool

    func body(content: Content) -> some View {
        if hasMenu {
            content.simultaneousGesture(
                LongPressGesture(minimumDuration: MessagePressClaim.pieceMinimumDuration)
                    .onEnded { _ in MessagePressClaim.claim(.avatar) }
            )
        } else {
            content
        }
    }
}
