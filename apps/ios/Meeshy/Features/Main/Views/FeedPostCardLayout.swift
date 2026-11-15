import SwiftUI

// MARK: - Hauteur du média d'une carte de post
//
// Pendant de `reelCardHeight` (ReelFeedLayout.swift) pour les cartes de POST,
// qui ne sont PAS immersives : le texte est affiché, puis le média.
//
// Le média occupe toute la largeur de la carte ; sa hauteur dérive du ratio
// source, bornée. Sans plafond, un clip vertical avale la colonne et le feed
// cesse d'être parcourable ; sans plancher, un panorama dégénère en filet.
//
// Convention de ratio IDENTIQUE à `reelCardHeight` : `hauteur / largeur`.

/// Hauteur du média d'une carte de post, en points.
///
/// Dimensions source absentes ou nulles → repli sur le plancher (`minRatio`),
/// cohérent avec l'ancien défaut 16:9 du lecteur vidéo, lui aussi sous plancher.
/// `nonisolated` (#4096) : arithmétique pure sur des entiers. La cible app
/// compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, donc l'isolation
/// était le DÉFAUT et non une décision — et elle rendait la règle inappelable
/// depuis la forme du carrousel, elle-même pure, comme depuis tout test
/// synchrone. Une règle qu'on ne peut pas interroger hors du fil principal
/// finit recopiée ailleurs : c'est ainsi qu'un site unique cesse d'en être un.
nonisolated func postCardMediaHeight(
    mediaWidth: Int?,
    mediaHeight: Int?,
    cardWidth: CGFloat,
    maxTallRatio: CGFloat = 1.4,
    minRatio: CGFloat = 0.75
) -> CGFloat {
    guard let w = mediaWidth, let h = mediaHeight, w > 0, h > 0 else {
        return (cardWidth * minRatio).rounded()
    }
    let ratio = CGFloat(h) / CGFloat(w)
    return (cardWidth * min(max(ratio, minRatio), maxTallRatio)).rounded()
}

// MARK: - Application de cette hauteur à une vue média

/// Largeur réellement offerte au média, publiée par le fond de la vue.
struct FeedMediaWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

/// Impose au média la hauteur dérivée de son ratio, la largeur restant libre.
///
/// La largeur est mesurée par un `GeometryReader` en `.background` — jamais en
/// conteneur : un reader qui enveloppe la vue détournerait la mise en page et
/// laisserait la largeur devenir la dimension libre, exactement ce qui faisait
/// s'effondrer les clips verticaux avant cette correction.
private struct FittedMediaHeight: ViewModifier {
    let mediaWidth: Int?
    let mediaHeight: Int?

    @State private var measuredWidth: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity)
            .frame(height: measuredWidth > 0
                   ? postCardMediaHeight(mediaWidth: mediaWidth, mediaHeight: mediaHeight, cardWidth: measuredWidth)
                   : nil)
            .background(
                GeometryReader { geo in
                    Color.clear.preference(key: FeedMediaWidthKey.self, value: geo.size.width)
                }
            )
            .onPreferenceChange(FeedMediaWidthKey.self) { width in
                if width > 0, abs(width - measuredWidth) > 0.5 { measuredWidth = width }
            }
    }
}

extension View {
    /// Cadre le média à la largeur de la carte, hauteur dérivée du ratio source.
    func fittedMediaHeight(mediaWidth: Int?, mediaHeight: Int?) -> some View {
        modifier(FittedMediaHeight(mediaWidth: mediaWidth, mediaHeight: mediaHeight))
    }
}
