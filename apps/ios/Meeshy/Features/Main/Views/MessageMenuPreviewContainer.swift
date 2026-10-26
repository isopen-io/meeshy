import SwiftUI
import MeeshySDK
import MeeshyUI

/// Conteneur d'aperçu du `.contextMenu` NATIF d'un message. Il rend la bulle
/// « standalone » (déjà dépouillée de ses spacers de row côté `BubbleStandard
/// Layout` → elle épouse son contenu) et la met à l'échelle UNIQUEMENT si elle
/// dépasse la hauteur disponible, pour qu'elle tienne dans l'écran SANS jamais
/// déformer ses proportions. La `.frame` finale (dimensions mises à l'échelle)
/// informe le layout SwiftUI de la taille visible — le platter système colle
/// alors à la bulle, sans bordure ni card (anti-« effet bordure »).
struct MessageMenuPreviewContainer<Content: View>: View {
    /// La fenêtre qui porte la vue (Stage Manager, Split View) — la fenêtre clé en repli.
    @Environment(\.sceneWindowSize) var sceneWindowSize
    private var hostHeight: CGFloat { SceneWindowSize.resolve(sceneWindowSize, fallback: DeviceLayout.windowSize).height }
    @ViewBuilder let content: () -> Content
    @State private var naturalSize: CGSize = .zero

    /// Plafond de hauteur de l'aperçu — 62 % de la **fenêtre** de l'app, pour
    /// laisser respirer la rangée d'emojis + le menu au-dessus/dessous. Mesuré
    /// sur la fenêtre et non sur l'écran physique : en Split View, Slide Over
    /// ou Stage Manager, l'app n'occupe qu'une fraction de l'écran, et un
    /// plafond dérivé de l'écran cesse alors de plafonner quoi que ce soit.
    /// (L'overlay custom `MessageOverlayMenu` poursuit le même but avec un
    /// plafond FIXE de 320 pt : il met à l'échelle une frame déjà capturée,
    /// pas une taille naturelle — mécanisme distinct, pas une valeur jumelle.)
    private var maxHeight: CGFloat { hostHeight * 0.62 }

    private var fitScale: CGFloat {
        guard naturalSize.height > maxHeight, naturalSize.height > 0 else { return 1 }
        // Plancher 0.5 : au-delà, un média très haut resterait lisible plutôt
        // que de rétrécir à l'infini (l'overlay custom pose le sien à 0.55).
        return max(0.5, maxHeight / naturalSize.height)
    }

    var body: some View {
        content()
            // **L'aperçu de l'appui long ne s'annonce pas** : le menu
            // natif est attaché sous la valeur d'annonce du fil, dont l'aperçu
            // hériterait. Fermé par défaut, une flamme y reste noire.
            .environment(\.announcesCapture, false)
            .background(
                GeometryReader { proxy in
                    Color.clear.preference(key: MessageMenuPreviewSizeKey.self, value: proxy.size)
                }
            )
            .onPreferenceChange(MessageMenuPreviewSizeKey.self) { naturalSize = $0 }
            .scaleEffect(fitScale, anchor: .center)
            .frame(
                width: naturalSize.width > 0 ? naturalSize.width * fitScale : nil,
                height: naturalSize.height > 0 ? naturalSize.height * fitScale : nil
            )
            // Le `.contextMenu` natif n'offre AUCUN rappel de présentation.
            // Son aperçu, lui, paraît exactement quand le menu s'ouvre — et
            // seulement alors : un appui long annulé ne le monte jamais. C'est
            // donc le seul point du chemin iOS 26 qui se déclenche à
            // l'ouverture RÉELLE, sans baisser le clavier pour rien.
            .onAppear { MessageMenuKeyboard.dismiss() }
    }
}

private struct MessageMenuPreviewSizeKey: PreferenceKey {
    static let defaultValue: CGSize = .zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
        let next = nextValue()
        if next != .zero { value = next }
    }
}
