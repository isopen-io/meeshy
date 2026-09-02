import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le sticker DESSINÉ, sans la bulle autour** — l'atome que toutes les
/// surfaces de conversation partagent.
///
/// Il vivait dans `BubbleSticker`, en `private`, avec la méta-ligne, le statut
/// de livraison et les réactions. Les modes FOCAL, SCRIPT et RIVIÈRE ont leur
/// propre rangée (`Focal/Row/`, qui « reproduit en une seule décision » ce que
/// `BubbleStandardLayout` fait) : ils ne pouvaient donc rien en tirer, et le
/// mot « sticker » n'apparaissait pas une fois dans tout `Focal/Row/`. **Un
/// message-sticker s'y lisait sans son sticker** — trois modes de lecture sur
/// quatre.
///
/// Extraire plutôt que recopier n'est pas un confort : le dessin porte quatre
/// règles qui divergeraient une par une — la priorité `template → image →
/// emoji`, la boîte d'un gabarit (plus large que haute), la place RÉSERVÉE
/// avant la première rasterisation (sans quoi la cellule saute), et le
/// mouvement, qui est une fonction pure du temps.
///
/// Ce que l'atome NE porte pas, délibérément : la méta-ligne, le statut, les
/// réactions, le fond. Ce sont des affaires d'HÔTE — une bulle les dessine,
/// une rangée focale a les siennes. L'atome rend le sticker, et rien d'autre.
struct MessageStickerArtwork: View {

    let sticker: BubbleContent.Sticker

    /// Le côté de référence. La bulle utilise le sien ; une rangée focale peut
    /// en demander un autre sans que le dessin change de règles.
    var side: CGFloat = BubbleSticker.side

    /// `false` pour une surface qui ne veut PAS d'animation (une capture, un
    /// aperçu figé). Reduce Motion est honoré indépendamment, par le
    /// `Environment` — ce drapeau ne le contredit jamais.
    var animates: Bool = true

    @Environment(\.displayScale) private var displayScale
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Rasterisation du gabarit — posée par `.task(id:)`, jamais dans `body`,
    /// qui se réévalue à chaque changement de l'hôte.
    @State private var templateImage: UIImage?
    @State private var templateSize: CGSize = .zero
    /// L'instant d'APPARITION : origine du temps du mouvement, et identité du
    /// calendrier d'un coup unique. `nil` hors écran — une animation continue
    /// s'y met en pause plutôt que de tourner pour personne.
    @State private var appearedAt: Date?

    private var source: BubbleSticker.RenderSource {
        BubbleSticker.RenderSource.resolve(sticker: sticker) {
            StickerTemplateRenderer.drawer(for: $0) != nil
        }
    }

    private var metrics: StickerTemplateMetrics {
        StickerTemplateMetrics.preview(side: side)
    }

    private var templateBox: CGSize {
        CGSize(width: side * 1.5, height: side)
    }

    /// La boîte RENDUE — les décalages de la pose en sont des fractions, donc
    /// un sticker plus petit bouge proportionnellement moins.
    private var artworkBox: CGSize {
        switch source {
        case .template: return BubbleSticker.fittedSize(
            templateSize == .zero ? templateBox : templateSize, within: templateBox)
        case .picture:  return CGSize(width: side, height: side)
        case .emoji:    return BubbleSticker.emojiBox
        }
    }

    /// L'animation EFFECTIVE. Reduce Motion la retire — la décoration reste,
    /// c'est le mouvement qui part (règle 6 des effets de message).
    private var effectiveAnimation: StickerAnimation? {
        guard animates, !reduceMotion else { return nil }
        return sticker.animation
    }

    var body: some View {
        artwork
            .modifier(MessageStickerMotion(animation: effectiveAnimation,
                                           appearedAt: appearedAt,
                                           box: artworkBox))
            .onAppear { appearedAt = Date() }
            .onDisappear { appearedAt = nil }
            .task(id: renderKey) { renderTemplateIfNeeded() }
    }

    private var renderKey: String {
        "\(sticker.templateId ?? "")|\(sticker.slots.map { "\($0)=\($1)" }.sorted().joined(separator: ","))|\(side)"
    }

    @ViewBuilder
    private var artwork: some View {
        switch source {
        case .template(let id):
            if let templateImage {
                let size = BubbleSticker.fittedSize(templateSize, within: templateBox)
                Image(uiImage: templateImage).resizable()
                    .frame(width: size.width, height: size.height)
            } else {
                // Avant la première rasterisation : RÉSERVER la place mesurée
                // plutôt que laisser un trou, pour que la cellule ne saute pas.
                let measured = StickerTemplateRenderer.measuredSize(
                    templateID: id, slots: sticker.slots, metrics: metrics)
                    ?? CGSize(width: side, height: side)
                let size = BubbleSticker.fittedSize(measured, within: templateBox)
                Color.clear.frame(width: size.width, height: size.height)
            }
        case .picture(let picture):
            // `autoLoad: true` : le PNG EST le message — pas une pièce jointe
            // qu'on choisit de télécharger. Sans lui, un sticker d'une version
            // plus récente n'aurait rien à montrer.
            ProgressiveCachedImage(
                thumbHash: picture.thumbHash,
                thumbnailUrl: picture.thumbnailUrl,
                fullUrl: picture.fileUrl,
                autoLoad: true,
                targetSize: CGSize(width: side, height: side)
            ) {
                Color(hex: picture.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fit)
            .frame(width: side, height: side)
        case .emoji(let emoji):
            Text(emoji)
                .font(MeeshyFont.relative(EmojiDetector.EmojiOnlyResult.single.fontSize ?? 90))
                .fixedSize()
        }
    }

    private func renderTemplateIfNeeded() {
        guard case .template(let id) = source else {
            templateImage = nil
            templateSize = .zero
            return
        }
        guard let rendered = StickerTemplateRenderer.image(
            templateID: id, slots: sticker.slots,
            metrics: metrics, screenScale: displayScale) else { return }
        templateImage = rendered.0
        templateSize = rendered.1
    }
}

/// La pose de `StickerAnimation.pose(at:)`, posée à chaque image depuis
/// l'instant d'apparition — fonction PURE du temps, aucune valeur animée par
/// SwiftUI, donc rien à interpoler et rien qui puisse rester coincé.
///
/// Un coup unique tourne sur une `TimelineSchedule.explicit` FINIE, identifiée
/// par `appearedAt` : chaque apparition crée un nouveau calendrier (et le
/// rejoue), et la vue cesse de se réévaluer une fois le coup joué. Une
/// animation continue tourne sur `.animation`, en pause tant que la vue n'est
/// pas apparue. `animation == nil` rend le contenu tel quel — aucune
/// `TimelineView` inerte par cellule, ce qui compte quand la liste en a cent.
struct MessageStickerMotion: ViewModifier {
    let animation: StickerAnimation?
    let appearedAt: Date?
    let box: CGSize

    @ViewBuilder
    func body(content: Content) -> some View {
        if let animation {
            if animation.isOneShot {
                TimelineView(.explicit(BubbleSticker.oneShotDates(
                    from: appearedAt ?? .distantFuture, animation: animation))) { context in
                    posed(content, animation.pose(at: elapsed(at: context.date)))
                }
                .id(appearedAt)
            } else {
                TimelineView(.animation(paused: appearedAt == nil)) { context in
                    posed(content, animation.pose(at: elapsed(at: context.date)))
                }
            }
        } else {
            content
        }
    }

    private func elapsed(at date: Date) -> Double {
        guard let appearedAt else { return 0 }
        return date.timeIntervalSince(appearedAt)
    }

    private func posed(_ content: Content, _ pose: StickerAnimation.Pose) -> some View {
        content
            .scaleEffect(pose.scale)
            .rotationEffect(.degrees(pose.rotationDegrees))
            .offset(x: pose.offsetX * box.width, y: pose.offsetY * box.height)
            .opacity(pose.opacity)
    }
}
