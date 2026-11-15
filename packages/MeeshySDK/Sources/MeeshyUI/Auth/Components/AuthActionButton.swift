import SwiftUI
import MeeshySDK

/// L'action principale d'un écran d'accès du SDK — « Recevoir le lien »,
/// « Rechercher », « Enregistrer le mot de passe ».
///
/// Pleine largeur de SA colonne, jamais de l'écran : c'est la colonne qui se
/// borne (`iPadFormWidth()`), et le bouton la suit. Pendant l'envoi le libellé
/// cède la place à un indicateur, mais VoiceOver garde le libellé : un bouton
/// qui ne s'annonce plus que « en cours » ne dit plus ce qu'il fait.
///
/// Il vivait en helper privé de `MeeshyForgotPasswordView` ; la feuille du
/// nouveau mot de passe, sortie dans sa propre vue (#6644), en a besoin aussi —
/// une copie aurait été une jumelle à tenir d'accord.
///
/// Bloqué par son hôte (`.disabled(...)`, formulaire incomplet), il SE VOIT
/// bloqué (#10884) : fond neutre, libellé blanc toujours lisible (AA), et
/// VoiceOver l'annonce « estompé » par le trait natif d'un `Button` désactivé.
struct AuthActionButton: View {
    let title: String
    let isLoading: Bool
    let action: @MainActor () async -> Void

    @Environment(\.isEnabled) private var isEnabled

    private var appearance: AuthActionButtonAppearance {
        .resolve(isEnabled: isEnabled)
    }

    var body: some View {
        Button {
            Task { await action() }
        } label: {
            HStack {
                if isLoading {
                    ProgressView().tint(.white)
                } else {
                    Text(title).fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.lg)
            .background(appearance.fill)
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
            .foregroundStyle(.white)
        }
        .disabled(isLoading)
        .accessibilityLabel(title)
        .padding(.horizontal, MeeshySpacing.xxl)
        .animation(MeeshyAnimation.springFast, value: isEnabled)
    }
}

/// Le style de `AuthActionButton` selon que son hôte l'autorise ou non.
/// L'envoi en cours n'y entre pas : l'action est LANCÉE, pas refusée — elle
/// garde la couleur de marque.
/// Le fond est le jeton de la charte (`MeeshyColors`), jamais une couleur hexadécimale en dur
/// reconstruit ; `fillHex` reste son jumeau hexadécimal pour le contrôle du
/// contraste AA.
nonisolated struct AuthActionButtonAppearance: Equatable, Sendable {
    let fill: Color
    let fillHex: String

    static func resolve(isEnabled: Bool) -> AuthActionButtonAppearance {
        isEnabled
            ? AuthActionButtonAppearance(fill: MeeshyColors.brandPrimary, fillHex: MeeshyColors.brandPrimaryHex)
            : AuthActionButtonAppearance(fill: MeeshyColors.neutral500, fillHex: MeeshyColors.neutral500Hex)
    }
}
