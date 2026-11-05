import SwiftUI
import MeeshyUI

/// **Une invite de réglage mène AU réglage** (#16339).
///
/// Une invite (« Activez le consentement vocal… », « Configurez d'abord un
/// master PIN… ») ouvrait les Réglages en haut de page : l'utilisateur devait
/// trouver seul la ligne. Elle désigne désormais SON réglage : l'écran défile
/// jusqu'à lui et le met en évidence.
enum SettingsFocus: String, Equatable, CaseIterable {
    /// Consentement vocal (transcription et traduction des vocaux) : le
    /// profil vocal, dont l'assistant recueille le consentement.
    case voiceProfile
    /// Master PIN des conversations verrouillées : Réglages ▸ Sécurité.
    case masterPin

    /// L'ancre de la section de l'écran Réglages où vit le réglage.
    var settingsAnchor: String {
        switch self {
        case .voiceProfile: return "settings.section.voice"
        case .masterPin: return "settings.section.account"
        }
    }

    /// Le réglage vit dans l'écran Sécurité, ouvert par-dessus les Réglages.
    var opensSecurity: Bool { self == .masterPin }
}

/// La demande en attente, posée par l'invite et CONSOMMÉE une fois par l'écran
/// qui montre le réglage — un retour ultérieur aux Réglages ne la rejoue pas.
@MainActor
final class SettingsFocusRequest: ObservableObject {
    nonisolated deinit {}
    static let shared = SettingsFocusRequest()

    @Published private(set) var pending: SettingsFocus?

    func request(_ focus: SettingsFocus) { pending = focus }

    /// Rend la demande et l'efface ; `nil` s'il n'y en a pas.
    func consume() -> SettingsFocus? {
        defer { pending = nil }
        return pending
    }

    /// Ne consomme que si la demande vise `focus` (l'écran Sécurité ne prend
    /// pas une demande destinée aux Réglages).
    func consume(_ focus: SettingsFocus) -> Bool {
        guard pending == focus else { return false }
        pending = nil
        return true
    }
}

/// La surbrillance d'un réglage désigné : un contour à l'accent qui s'éteint
/// après deux secondes. Réduire les animations ⇒ contour posé sans pulsation.
struct SettingsFocusHighlight: ViewModifier {
    let isActive: Bool
    @State private var lit = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                    .stroke(MeeshyColors.brandPrimary, lineWidth: 2)
                    .opacity(lit ? 1 : 0)
                    .allowsHitTesting(false)
            )
            .onAppear { if isActive { light() } }
            .adaptiveOnChange(of: isActive) { _, active in if active { light() } }
    }

    private func light() {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.35).repeatCount(3, autoreverses: true)) { lit = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) {
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.4)) { lit = false }
        }
    }
}
