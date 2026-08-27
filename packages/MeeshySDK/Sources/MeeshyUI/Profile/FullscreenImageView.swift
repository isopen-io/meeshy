import SwiftUI
import Combine
import MeeshySDK

// MARK: - Fullscreen Image View

public struct FullscreenImageView: View {
    public let imageURL: String?
    public let fallbackText: String
    public let accentColor: String
    /// #3897 — décision produit EXPOSÉE, pas codée en dur. Défaut `true` :
    /// ouvrir plein écran est un geste manuel (§14.1), donc la politique
    /// réseau ambiante (Low Data / Wi-Fi seul) est bypassée par défaut — un
    /// spinner infini serait pire qu'un octet dépensé sur un geste explicite.
    /// Un futur appelant présentant cette vue SANS geste explicite (ex. un
    /// aperçu déclenché ambiante) peut désormais demander `false` sans
    /// dupliquer la vue.
    public let autoLoad: Bool
    @Environment(\.dismiss) private var dismiss

    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var isDragging = false

    public init(imageURL: String?, fallbackText: String, accentColor: String, autoLoad: Bool = true) {
        self.imageURL = imageURL
        self.fallbackText = fallbackText
        self.accentColor = accentColor
        self.autoLoad = autoLoad
    }

    public var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

            if let urlString = imageURL, !urlString.isEmpty {
                // CachedAsyncImage (DiskCacheStore persistant) plutôt qu'AsyncImage :
                // l'image plein écran a presque toujours déjà été téléchargée par
                // l'avatar/la bannière — la rouvrir doit être un hit disque, pas
                // un nouveau téléchargement.
                // autoLoad: true — ouvrir plein écran est un geste manuel (§14.1) :
                // la politique réseau ambiante (Low Data / Wi-Fi seul) ne doit
                // jamais laisser le viewer sur un spinner infini quand l'image
                // n'est pas encore sur l'appareil.
                // targetSize: WindowMetrics.windowSize (#3895) — sans lui, le
                // décodage plafonnait au budget PAR DÉFAUT du pipeline (1200 px)
                // quel que soit l'écran : flou sur une fenêtre plus large qu'un
                // iPhone (iPad), gaspillage mémoire sur une fenêtre plus petite.
                // Un avatar/bannière n'a pas de variantes responsive
                // (`MeeshyUser.avatarURL`/`bannerURL` sont de simples chaînes,
                // contrairement à `MessageAttachment.imageVariants`) —
                // `ImageVariantSelector.bestImageURL` y serait un no-op (candidats
                // vides → toujours l'original) ; le levier applicable est la
                // taille de décodage, pas la sélection d'URL.
                CachedAsyncImage(url: urlString, targetSize: WindowMetrics.windowSize, autoLoad: autoLoad) {
                    ProgressView()
                        .tint(Color(hex: accentColor))
                }
                .scaledToFit()
                .scaleEffect(scale)
                .offset(offset)
                .gesture(
                    MagnificationGesture()
                        .onChanged { value in
                            scale = max(1.0, min(value, 4.0))
                        }
                )
                .simultaneousGesture(
                    DragGesture()
                        .onChanged { value in
                            isDragging = true
                            offset = value.translation
                        }
                        .onEnded { _ in
                            isDragging = false
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                offset = .zero
                            }
                        }
                )
            } else {
                fallbackView
            }

            // Close button
            VStack {
                HStack {
                    Spacer()
                    Button {
                        HapticFeedback.light()
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundColor(.white.opacity(0.8))
                            .shadow(color: .black.opacity(0.3), radius: 4)
                    }
                    .padding(.trailing, 20)
                    .padding(.top, 50)
                }
                Spacer()
            }
        }
        .statusBar(hidden: true)
    }

    @ViewBuilder
    private var fallbackView: some View {
        MeeshyAvatar(
            name: fallbackText,
            context: .custom(200),
            accentColor: accentColor
        )
    }
}
