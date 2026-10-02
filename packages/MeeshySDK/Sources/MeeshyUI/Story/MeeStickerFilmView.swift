import SwiftUI
import UIKit

/// **Un sticker Mee ou Meo, animé** (#9053) — la même vue dans la feuille et
/// dans la bulle.
///
/// La première image s'affiche AUSSITÔT (lue sur le rendu : un WebP de 360 px
/// se décode en une image) ; le film se décode hors du fil principal, puis
/// prend sa place. `animates: false` (vignettes de la feuille) ou Reduce
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
            if still == nil { still = MeeStickerCatalog.stillImage(sticker) }
            guard animates, !reduceMotion, sticker.animated,
                  let url = MeeStickerCatalog.fileURL(for: sticker) else { return }
            await MeeStickerCatalog.prepareFilm(at: url, maxPixelSize: maxPixelSize)
            guard !Task.isCancelled else { return }
            film = MeeStickerCatalog.decoded(sticker, maxPixelSize: maxPixelSize)
        }
        .onDisappear { film = nil }
        .accessibilityHidden(true)
    }
}
