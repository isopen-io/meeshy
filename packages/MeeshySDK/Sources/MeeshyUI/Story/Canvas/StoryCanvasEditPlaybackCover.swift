import SwiftUI
import UIKit
import MeeshySDK

/// **Une scène recouverte se tait, et reprend quand on la découvre** (#12605).
///
/// Un `fullScreenCover` ne prévient pas l'écran qu'il recouvre (#9052) : la scène du composer
/// continuait de jouer ses vidéos et son son SOUS la retouche plein écran (mesuré au simulateur).
/// C'est donc le contenu présenté qui se DÉCLARE (`.coversScenePlayback()`) : à son apparition,
/// chaque canevas d'édition sonore vivant À CET INSTANT suspend vidéo et son ; à sa disparition,
/// il reprend. Un canevas monté PENDANT la couverture (celui de la couverture elle-même) joue.
@MainActor
public enum StoryEditPlaybackCover {

    /// Une couverture en cours : les canevas qu'elle a suspendus.
    public final class Token {
        fileprivate let canvases = NSHashTable<StoryCanvasUIView>.weakObjects()
        nonisolated deinit {}
    }

    /// Combien de couvertures pèsent sur chaque canevas.
    private static let counts = NSMapTable<StoryCanvasUIView, NSNumber>.weakToStrongObjects()

    /// Suspend les canevas d'édition sonores vivants — ceux du composer.
    public static func begin() -> Token {
        let token = Token()
        StoryCanvasUIView.editAudioCanvases.allObjects.forEach { canvas in
            token.canvases.add(canvas)
            cover(canvas)
        }
        return token
    }

    /// Rend la main : chaque canevas suspendu par `token` reprend, s'il n'est pas couvert ailleurs.
    public static func end(_ token: Token) {
        token.canvases.allObjects.forEach(uncover)
        token.canvases.removeAllObjects()
    }

    /// Un canevas couvert ne relance ni vidéo ni son, quelle que soit la porte (repos, touche, slide).
    static func covers(_ canvas: StoryCanvasUIView) -> Bool {
        (counts.object(forKey: canvas)?.intValue ?? 0) > 0
    }

    private static func cover(_ canvas: StoryCanvasUIView) {
        let avant = counts.object(forKey: canvas)?.intValue ?? 0
        counts.setObject(NSNumber(value: avant + 1), forKey: canvas)
        guard avant == 0, canvas.mode == .edit else { return }
        canvas.backgroundLayer.isPlaybackActive = false
        canvas.forEachMediaLayer { $0.playsInEditMode = false }
        canvas.forEachAVPlayer { $0.pause() }
        canvas.audioMixer.pause()
    }

    private static func uncover(_ canvas: StoryCanvasUIView) {
        let avant = counts.object(forKey: canvas)?.intValue ?? 0
        guard avant > 0 else { return }
        guard avant == 1 else { return counts.setObject(NSNumber(value: avant - 1), forKey: canvas) }
        counts.removeObject(forKey: canvas)
        canvas.resumeEditModeMediaFromIdle()
    }
}

private struct StoryEditPlaybackCoverModifier: ViewModifier {
    @State private var token: StoryEditPlaybackCover.Token?

    func body(content: Content) -> some View {
        content
            .onAppear { if token == nil { token = StoryEditPlaybackCover.begin() } }
            .onDisappear {
                guard let token else { return }
                StoryEditPlaybackCover.end(token)
                self.token = nil
            }
    }
}

public extension View {
    /// Le contenu présenté plein écran déclare qu'il recouvre la scène : elle se tait dessous.
    func coversScenePlayback() -> some View {
        modifier(StoryEditPlaybackCoverModifier())
    }
}
