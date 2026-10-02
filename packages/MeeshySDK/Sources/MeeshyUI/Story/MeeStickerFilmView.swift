import SwiftUI
import UIKit

/// **Un sticker Mee ou Meo, animé** (#9053) — la même vue dans la feuille et
/// dans la bulle.
///
/// La première image, réduite à la case, puis le film : tous deux décodés
/// hors du fil principal, le film seulement si la case reste à l'écran. `animates: false` (vignettes de la feuille) ou Reduce
/// Motion ⇒ l'image reste fixe : le sticker perd son mouvement, pas son
/// intention — `AnimatedImageView` honore les deux préférences.
public struct MeeStickerFilmView: View {

    let sticker: MeeSticker
    let side: CGFloat
    let animates: Bool
    let pixelCap: Int

    @Environment(\.displayScale) private var displayScale
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var still: UIImage?
    @State private var film: AnimatedImageDecoder.Decoded?

    /// - Parameter pixelCap: la définition maximale du décodage. Jamais
    ///   au-delà du film tourné (360 px) ; la feuille, qui anime une grille
    ///   entière, la baisse (`gridPixelCap`) — la mémoire d'un film croît au
    ///   carré de sa définition.
    public init(sticker: MeeSticker, side: CGFloat, animates: Bool = true, pixelCap: Int = 360) {
        self.sticker = sticker
        self.side = side
        self.animates = animates
        self.pixelCap = pixelCap
    }

    /// Une case de 96 pt décodée à 180 px : 48 images pèsent 6 Mo, quinze
    /// cases visibles tiennent sous le plafond du cache (96 Mo).
    public static let gridPixelCap = 180

    /// Le temps qu'une case reste à l'écran avant que son film se décode.
    static let filmDelayMilliseconds = 150

    public static func decodePixelSize(side: CGFloat, scale: CGFloat, cap: Int) -> Int {
        min(cap, 360, Int((side * scale).rounded(.up)))
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
                AnimatedImageView(decoded: film)
                    .allowsHitTesting(false)
            } else if let still {
                Image(uiImage: still).resizable().scaledToFit()
            } else {
                Color.clear
            }
        }
        .frame(width: side, height: side)
        .contentShape(Rectangle())
        .task(id: "\(sticker.id)|\(animates && !reduceMotion)|\(maxPixelSize)") {
            guard let url = MeeStickerCatalog.fileURL(for: sticker) else { return }
            if still == nil { still = await MeeStickerCatalog.still(at: url, maxPixelSize: maxPixelSize) }
            guard animates, !reduceMotion, sticker.animated else { return }
            // Une case qui ne fait que PASSER pendant un lancer ne décode rien :
            // sa tâche est annulée avant la fin de ce délai.
            try? await Task.sleep(for: .milliseconds(Self.filmDelayMilliseconds))
            guard !Task.isCancelled,
                  let entry = await MeeStickerCatalog.film(at: url, maxPixelSize: maxPixelSize),
                  !Task.isCancelled else { return }
            film = entry.decoded
        }
        .onDisappear { film = nil }
        .accessibilityHidden(true)
    }
}
