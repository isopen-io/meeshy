import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Un média introuvable a un état DESSINÉ (#8141)

/// L'état de chargement d'une page image de la galerie.
///
/// Un fichier purgé, expiré ou refusé (`404`/`410`/`403`) ne produira jamais
/// d'image : la page restait sur un indicateur de chargement sans fin, sur
/// fond noir, sans rien à faire. L'échec est maintenant un état, et « Réessayer »
/// en sort par une NOUVELLE tentative — `attempt` change l'identité du
/// chargeur, donc sa requête est rejouée au lieu d'être supposée.
nonisolated struct GalleryImageLoadPhase: Equatable {
    private(set) var isFailed = false
    private(set) var attempt = 0

    /// Le réseau n'a rien rendu pour la tentative COURANTE. Une tentative déjà
    /// remplacée par « Réessayer » ne peut plus faire échouer la page.
    mutating func fail(attempt reported: Int) {
        guard reported == attempt else { return }
        isFailed = true
    }

    mutating func retry() {
        isFailed = false
        attempt += 1
    }
}

/// Pictogramme + phrase + « Réessayer », posés au centre du cadre. Ni image
/// brisée, ni indicateur : l'absence se DIT.
struct GalleryMediaUnavailableView: View {
    let onRetry: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "photo.badge.exclamationmark")
                .font(.system(size: 44))
                .foregroundColor(.white.opacity(0.55))
                .accessibilityHidden(true)
            Text(String(localized: "gallery.media.unavailable", defaultValue: "Ce média n'est plus disponible", bundle: .main))
                .font(.subheadline)
                .foregroundColor(.white.opacity(0.85))
                .multilineTextAlignment(.center)
            Button(action: onRetry) {
                Text(String(localized: "common.retry", defaultValue: "Réessayer", bundle: .main))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 18)
                    .frame(minHeight: 44)
                    .background(Capsule().fill(Color.white.opacity(0.18)))
            }
            .buttonStyle(.plain)
        }
        .padding(24)
        .accessibilityElement(children: .contain)
    }
}
