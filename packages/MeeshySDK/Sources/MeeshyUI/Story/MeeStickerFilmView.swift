import SwiftUI
import UIKit
import MeeshySDK
@preconcurrency import Lottie

/// **Un sticker Mee ou Meo, animé** (#9053, #10639) — la même vue dans la
/// feuille et dans la bulle.
///
/// La première image, réduite à la case et rendue hors du geste, puis le film
/// lui-même : le `.lottie` joué par `LottieView` sur le moteur Core Animation
/// — le mouvement tourne dans le serveur de rendu, à la cadence de l'écran,
/// sans aucune image à décoder ni à garder en mémoire. Le film ne se monte que
/// si la case reste à l'écran. `animates: false` (vignettes de la feuille) ou
/// Reduce Motion ⇒ l'image reste fixe : le sticker perd son mouvement, pas son
/// intention.
public struct MeeStickerFilmView: View {

    let filmID: String
    let filmAnimated: Bool
    let side: CGFloat
    let animates: Bool
    let pixelCap: Int

    @Environment(\.displayScale) private var displayScale
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var still: UIImage?
    @State private var film: LottieFilmSource?

    /// - Parameter pixelCap: la définition maximale de l'image fixe. Le film,
    ///   vectoriel, se dessine net à toute taille.
    public init(sticker: MeeSticker, side: CGFloat, animates: Bool = true, pixelCap: Int = 360) {
        self.init(filmID: sticker.id, animated: sticker.animated, side: side, animates: animates, pixelCap: pixelCap)
    }

    /// Le film d'un identifiant du catalogue Mee — un Instant le joue sous son
    /// texte natif (#9069).
    public init(filmID: String, animated: Bool, side: CGFloat, animates: Bool = true, pixelCap: Int = 360) {
        self.filmID = filmID
        self.filmAnimated = animated
        self.side = side
        self.animates = animates
        self.pixelCap = pixelCap
    }

    /// La définition de l'image fixe d'une case de la feuille.
    public static let gridPixelCap = 180

    /// Le temps qu'une case reste à l'écran avant que son film se monte.
    static let filmDelayMilliseconds = 150

    public static func decodePixelSize(side: CGFloat, scale: CGFloat, cap: Int) -> Int {
        min(cap, MeeStickerCatalog.filmPixelSize, Int((side * scale).rounded(.up)))
    }

    private var maxPixelSize: Int {
        Self.decodePixelSize(side: side, scale: displayScale, cap: pixelCap)
    }

    public var body: some View {
        Group {
            if let film, animates, !reduceMotion {
                // Transparente aux touchers : un Mee ne change pas la bulle qui
                // le porte — appui long, double tap, glisser-répondre partent
                // comme sur un gabarit (retour porteur 2026-10-01).
                LottieView(animation: film.animation)
                    .configuration(LottieConfiguration(renderingEngine: .automatic))
                    .playing(loopMode: .loop)
                    .resizable()
                    .allowsHitTesting(false)
            } else if let still {
                Image(uiImage: still).resizable().scaledToFit()
            } else {
                Color.clear
            }
        }
        .frame(width: side, height: side)
        .contentShape(Rectangle())
        .task(id: "\(filmID)|\(animates && !reduceMotion)|\(maxPixelSize)") {
            guard let url = MeeStickerCatalog.fileURL(id: filmID) else { return }
            if still == nil { still = await MeeStickerCatalog.still(at: url, maxPixelSize: maxPixelSize) }
            guard animates, !reduceMotion, filmAnimated else { return }
            // Une case qui ne fait que PASSER pendant un lancer ne monte rien :
            // sa tâche est annulée avant la fin de ce délai.
            guard await cancellableSleep(for: .milliseconds(Self.filmDelayMilliseconds)),
                  let source = await LottieFilm.load(url: url),
                  !Task.isCancelled else { return }
            film = source
        }
        .onDisappear { film = nil }
        .accessibilityHidden(true)
    }
}
