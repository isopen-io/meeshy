import SwiftUI
import PencilKit
import MeeshySDK

/// Mini composite preview of a slide's canvas at t=0.
/// Renders all layers (background, drawing, foreground media, text, stickers)
/// preserving normalized position, scale, and rotation of each element.
struct SlideMiniPreview: View {
    let effects: StoryEffects
    let bgImage: UIImage?
    let drawingData: Data?
    let loadedImages: [String: UIImage]
    let index: Int

    var body: some View {
        GeometryReader { geo in
            ZStack {
                backgroundLayers(in: geo.size)
                drawingLayer
                foregroundMediaLayer(in: geo.size)
                textLayer(in: geo.size)
                stickerLayer(in: geo.size)
                indexBadge
                bgColorDot(in: geo.size)
            }
        }
        .clipped()
    }

    // MARK: - Background Layers

    @ViewBuilder
    private func backgroundLayers(in size: CGSize) -> some View {
        // Layer 0: Background color
        if let bg = effects.background {
            Color(hex: bg)
        } else {
            Color(hex: "1A1A2E")
        }

        // Layer 1: User-picked background image
        if let image = bgImage {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: size.width, height: size.height)
        }

        // Layer 1b: Background media object
        bgMediaImage(in: size)
    }

    @ViewBuilder
    private func bgMediaImage(in size: CGSize) -> some View {
        // Background media resolu via le helper SDK (respecte isBackground=true,
        // sinon retombe sur le 1er media legacy). Avant on utilisait
        // `mediaObjects.first` directement, qui montrait le mauvais element comme
        // background apres un toggleBackground manuel.
        if let bgMedia = effects.resolvedBackgroundMedia,
           bgMedia.kind == .image,
           let img = loadedImages[bgMedia.id] {
            Image(uiImage: img)
                .resizable()
                .scaledToFill()
                .frame(width: size.width, height: size.height)
                .scaleEffect(CGFloat(bgMedia.scale))
                .rotationEffect(.degrees(Double(bgMedia.rotation)))
                .position(x: CGFloat(bgMedia.x) * size.width, y: CGFloat(bgMedia.y) * size.height)
        }
    }

    // MARK: - Drawing Layer

    @ViewBuilder
    private var drawingLayer: some View {
        if let data = drawingData,
           let drawing = try? PKDrawing(data: data),
           !drawing.bounds.isEmpty {
            Image(uiImage: drawing.image(from: drawing.bounds, scale: 1.0))
                .resizable()
                .scaledToFill()
        }
    }

    // MARK: - Foreground Media

    @ViewBuilder
    private func foregroundMediaLayer(in size: CGSize) -> some View {
        // Tous les media non-background — alignement sur le helper SDK plutot que
        // sur `dropFirst()` qui ratait le cas ou l'utilisateur a toggle un autre
        // media en background via le menu contextuel.
        ForEach(effects.resolvedForegroundMediaObjects) { media in
            foregroundMediaItem(media, in: size)
        }
    }

    @ViewBuilder
    private func foregroundMediaItem(_ media: StoryMediaObject, in size: CGSize) -> some View {
        if let img = loadedImages[media.id] {
            let baseSize = size.width * 0.35
            Image(uiImage: img)
                .resizable()
                .scaledToFit()
                .frame(width: baseSize * CGFloat(media.scale),
                       height: baseSize * CGFloat(media.scale))
                .rotationEffect(.degrees(Double(media.rotation)))
                .position(x: CGFloat(media.x) * size.width,
                          y: CGFloat(media.y) * size.height)
        }
    }

    // MARK: - Text Layer

    @ViewBuilder
    private func textLayer(in size: CGSize) -> some View {
        let texts = effects.textObjects ?? []
        ForEach(texts) { text in
            textItem(text, in: size)
        }
    }

    @ViewBuilder
    private func textItem(_ text: StoryTextObject, in size: CGSize) -> some View {
        // 393pt = design reference width (9:16 canvas on iPhone 14 Pro). Mini preview scales proportionally.
        let fontSize = max(3, (text.textSize ?? 24) * size.width / 393)
        Text(text.content.isEmpty ? " " : text.content)
            .font(.system(size: fontSize, weight: .medium))
            .foregroundColor(Color(hex: text.textColor ?? "FFFFFF"))
            .lineLimit(1)
            .scaleEffect(text.scale)
            .rotationEffect(.degrees(Double(text.rotation)))
            .position(x: text.x * size.width,
                      y: text.y * size.height)
    }

    // MARK: - Sticker Layer

    @ViewBuilder
    private func stickerLayer(in size: CGSize) -> some View {
        let stickers = effects.stickerObjects ?? []
        ForEach(stickers) { sticker in
            Text(sticker.emoji)
                .font(.system(size: max(3, CGFloat(sticker.scale) * 4)))
                .rotationEffect(.degrees(Double(sticker.rotation)))
                .position(x: CGFloat(sticker.x) * size.width,
                          y: CGFloat(sticker.y) * size.height)
        }
    }

    // MARK: - Index Badge

    private var indexBadge: some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                Text("\(index + 1)")
                    .font(.system(size: 7, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 3)
                    .padding(.vertical, 1)
                    .background(Color.black.opacity(0.55))
                    .clipShape(RoundedRectangle(cornerRadius: 2))
                    .padding(2)
            }
        }
    }

    // MARK: - Background Color Dot

    @ViewBuilder
    private func bgColorDot(in size: CGSize) -> some View {
        let hasBgImage = bgImage != nil
            || effects.resolvedBackgroundMedia.flatMap { loadedImages[$0.id] } != nil
        if hasBgImage, let bg = effects.background {
            VStack {
                Spacer()
                HStack {
                    Circle()
                        .fill(Color(hex: bg))
                        .frame(width: 8, height: 8)
                        .overlay(Circle().stroke(Color.white, lineWidth: 0.5))
                        .padding(2)
                    Spacer()
                }
            }
        }
    }
}
