import SwiftUI
import MeeshyUI

/// **Une invite de réglage mène AU réglage** (#16339).
///
/// Une invite (« Activez le consentement vocal… », « Configurez d'abord un
/// master PIN… ») ouvrait les Réglages en haut de page : l'utilisateur devait
/// trouver seul la ligne. Elle désigne désormais SON réglage : l'écran défile
/// jusqu'à lui et le met en évidence.
enum SettingsFocus: String, Equatable, CaseIterable, Identifiable {
    /// Consentement vocal (transcription et traduction des vocaux) : le
    /// profil vocal, dont la GESTION s'ouvre directement (#16418).
    case voiceProfile
    /// Aucun consentement vocal, donc aucun profil : l'ASSISTANT, qui recueille
    /// le consentement, s'ouvre directement (#16418).
    case voiceProfileCreation
    /// La transcription des vocaux, quand c'est elle qui manque (#16418).
    case transcription
    /// Master PIN des conversations verrouillées : Réglages ▸ Sécurité.
    case masterPin
    /// Mon e-mail, changé et vérifié dans Réglages ▸ Sécurité (#18590 : la
    /// rangée Contact de ma fiche y mène).
    case securityEmail
    /// Mon téléphone, changé et vérifié dans Réglages ▸ Sécurité (#18590).
    case securityPhone

    var id: String { rawValue }

    /// La feuille que les Réglages ouvrent d'eux-mêmes pour ce réglage.
    enum Sheet: Equatable { case voiceProfileManage, voiceProfileWizard }

    /// La rangée des Réglages qui mène au réglage (#18589).
    var destination: SettingsDestination {
        switch self {
        case .voiceProfile, .voiceProfileCreation: return .voiceProfile
        case .transcription: return .transcriptionMine
        case .masterPin, .securityEmail, .securityPhone: return .security
        }
    }

    /// L'ancre du bloc où vit la rangée : la loi des Réglages la porte, une
    /// invite n'en recopie aucune.
    var settingsAnchor: String? {
        SettingsLayout.block(containing: destination)?.id.anchor
    }

    /// Le réglage vit sous le pli « Annexes » : l'écran le déplie avant de
    /// défiler, sans quoi l'ancre visée ne serait pas montée.
    var unfoldsAnnex: Bool { SettingsLayout.unfoldsAnnex(toReach: destination) }

    /// Le réglage vit dans l'écran Sécurité, ouvert par-dessus les Réglages.
    var opensSecurity: Bool { destination == .security }

    /// La section où l'écran Sécurité se pose en s'ouvrant : celle qu'on lui a
    /// désignée, sinon celle qu'une invite a demandée, sinon aucune. Un réglage
    /// qui ne vit pas dans Sécurité n'y désigne rien.
    static func securityLanding(initial: SettingsFocus?, requested: SettingsFocus?) -> SettingsFocus? {
        [initial, requested].compactMap { $0 }.first { $0.opensSecurity }
    }

    /// La configuration de la voix s'ouvre DIRECTEMENT, sans second toucher.
    var opensSheet: Sheet? {
        switch self {
        case .voiceProfile: return .voiceProfileManage
        case .voiceProfileCreation: return .voiceProfileWizard
        case .transcription, .masterPin, .securityEmail, .securityPhone: return nil
        }
    }
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

    /// Consomme la demande si elle vise l'écran Sécurité ; une demande destinée
    /// aux Réglages reste en attente.
    func consumeSecurityFocus() -> SettingsFocus? {
        guard let pending, pending.opensSecurity else { return nil }
        self.pending = nil
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
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

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
        let reduce = reduceMotion
        meeshyWithAnimation(.easeInOut(duration: 0.35).repeatCount(3, autoreverses: true), reduceMotion: reduce) { lit = true }
        Task { await DelayedUI.perform(after: .milliseconds(2200)) {
            meeshyWithAnimation(.easeOut(duration: 0.4), reduceMotion: reduce) { lit = false }
        } }
    }
}
