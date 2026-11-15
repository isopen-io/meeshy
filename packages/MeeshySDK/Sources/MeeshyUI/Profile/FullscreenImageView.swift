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
    /// Qui ferme : l'hôte qui a POSÉ la vue sur sa propre feuille la retire lui-même — `dismiss()` y fermerait la
    /// feuille entière. `nil` : la vue a été PRÉSENTÉE, elle se renvoie.
    public let onClose: (() -> Void)?
    @Environment(\.dismiss) private var dismiss

    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var dismissDrag: CGFloat = 0

    public init(imageURL: String?, fallbackText: String, accentColor: String, autoLoad: Bool = true,
                onClose: (() -> Void)? = nil) {
        self.imageURL = imageURL
        self.fallbackText = fallbackText
        self.accentColor = accentColor
        self.autoLoad = autoLoad
        self.onClose = onClose
    }

    public var body: some View {
        ZStack {
            Color.black
                .opacity(FullscreenDismissDrag.backdropOpacity(translation: dismissDrag))
                .ignoresSafeArea()

            Group {
                if let urlString = imageURL, !urlString.isEmpty {
                    // CachedAsyncImage (DiskCacheStore persistant) : l'image plein écran a presque toujours déjà été
                    // téléchargée par l'avatar/la bannière — la rouvrir est un hit disque. autoLoad: true — ouvrir
                    // plein écran est un geste manuel (§14.1). targetSize: WindowMetrics.windowSize (#3895) — le
                    // décodage suit la fenêtre, pas le budget par défaut du pipeline.
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
                } else {
                    fallbackView
                }
            }
            .offset(y: dismissDrag)
            .simultaneousGesture(dragGesture)
            .accessibilityAction(.escape) { close() }

            VStack {
                FullscreenTopBar(onClose: { close() })
                Spacer()
            }
            .opacity(dismissDrag > 0 ? 0 : 1)
        }
        .statusBarHidden(true)
        .modifier(SeeThroughPresentation())
    }

    /// Agrandie, l'image se déplace sous le doigt ; à sa taille, le doigt la tire vers la sortie.
    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                if scale > 1 {
                    offset = value.translation
                } else {
                    dismissDrag = max(0, value.translation.height)
                }
            }
            .onEnded { value in
                if scale <= 1, FullscreenDismissDrag.shouldDismiss(
                    translation: value.translation.height, predictedEnd: value.predictedEndTranslation.height
                ) {
                    close()
                    return
                }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    offset = .zero
                    dismissDrag = 0
                }
            }
    }

    private func close() {
        if let onClose {
            onClose()
        } else {
            dismiss()
        }
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

/// Présentée (`fullScreenCover`), la visionneuse laisse voir l'écran qu'elle couvre quand le glissement éclaircit
/// son fond — sans quoi le fond système, blanc ou noir, apparaîtrait sous l'image en plein geste.
private struct SeeThroughPresentation: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 16.4, *) {
            content.presentationBackground(.clear)
        } else {
            content
        }
    }
}

// MARK: - Le glissement qui referme (#10093)

/// Le plein écran d'une bannière ou d'une photo se referme d'un glissement vers le bas, PROGRESSIF et ANNULABLE :
/// l'image suit le doigt, le fond s'éclaircit avec elle, et rien n'est décidé avant la levée du doigt — ramené vers
/// le haut, le geste n'a rien fait.
enum FullscreenDismissDrag {
    /// La course au-delà de laquelle le doigt levé referme.
    static let dismissDistance: CGFloat = 140
    /// La lancée (fin prédite) qui referme même sur une course courte.
    static let flickDistance: CGFloat = 320
    /// Le fond ne s'éclaircit jamais au point de laisser voir la fiche dessous en plein geste.
    static let minimumBackdropOpacity: Double = 0.35
    private static let fadeDistance: CGFloat = 400

    static func backdropOpacity(translation: CGFloat) -> Double {
        guard translation > 0 else { return 1 }
        let faded = 1 - Double(translation / fadeDistance)
        return max(minimumBackdropOpacity, faded)
    }

    static func shouldDismiss(translation: CGFloat, predictedEnd: CGFloat) -> Bool {
        guard translation > 0 else { return false }
        return translation >= dismissDistance || predictedEnd >= flickDistance
    }
}

// MARK: - Ce qu'un toucher ouvre en plein écran (#10093)

/// Une image de profil (bannière ou photo) ouverte en plein écran. `nil` sans image : rien ne s'ouvre.
public struct ProfileFullscreenImage: Identifiable, Equatable {
    public let url: String
    public let fallbackText: String
    public var id: String { url }

    public init(url: String, fallbackText: String) {
        self.url = url
        self.fallbackText = fallbackText
    }

    public static func opening(_ url: String?, fallbackText: String) -> ProfileFullscreenImage? {
        guard let url, !url.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return ProfileFullscreenImage(url: url, fallbackText: fallbackText)
    }
}
