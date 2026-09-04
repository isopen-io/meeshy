import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le refus d'accès a un ÉCRAN, pas un fond noir** (#4080).
///
/// Il vivait en privé dans `CameraView`. Le viseur en scène en a besoin pour la
/// même raison, et plus fort : la feuille remplit l'écran, donc son fond noir
/// se lit comme « la caméra », tandis que la scène a la taille d'une carte —
/// une carte noire y est **indiscernable d'une scène vide**.
///
/// > Un état qui ressemble à un défaut ET à un refus est le pire des deux :
/// > l'auteur cherche une panne là où il n'y a qu'une case à cocher.
struct CameraPermissionPanel: View {
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "camera.fill")
                .font(.system(size: 38, weight: .light))
                .foregroundStyle(.white.opacity(0.7))

            Text(String(localized: "camera.permission.denied.title",
                        defaultValue: "Accès à la caméra refusé", bundle: .main))
                .font(MeeshyFont.relative(16, weight: .semibold))
                .foregroundStyle(.white)

            Text(String(localized: "camera.permission.denied.body",
                        defaultValue: "Autorisez Meeshy à utiliser la caméra pour prendre des photos et des vidéos.",
                        bundle: .main))
                .font(MeeshyFont.relative(13))
                .foregroundStyle(.white.opacity(0.75))
                .multilineTextAlignment(.center)

            Button {
                MediaPermissionCoordinator.openSettings()
            } label: {
                Text(String(localized: "camera.permission.openSettings",
                            defaultValue: "Ouvrir les Réglages", bundle: .main))
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 20)
                    .frame(height: 44)
                    .background(Capsule().fill(.white))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.opacity(0.55))
    }
}
