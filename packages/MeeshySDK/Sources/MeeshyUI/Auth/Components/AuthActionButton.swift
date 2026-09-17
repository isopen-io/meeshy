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
struct AuthActionButton: View {
    let title: String
    let isLoading: Bool
    let action: () async -> Void

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
            .padding(.vertical, 16)
            .background(MeeshyColors.brandPrimary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .foregroundStyle(.white)
        }
        .disabled(isLoading)
        .accessibilityLabel(title)
        .padding(.horizontal, 24)
    }
}
