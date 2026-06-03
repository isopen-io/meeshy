import SwiftUI
import PencilKit
import MeeshySDK

/// Approximation des filtres `StoryFilter` via les modifiers SwiftUI natifs.
/// Le main canvas n'applique que `vintage` + `bwContrast` via Metal kernel ;
/// les 6 autres filtres exposés par la grille n'ont actuellement aucun
/// effet sur le rendu Metal. Cette approximation ne cherche PAS la parité
/// pixel-perfect — elle vise un retour visuel cohérent à l'utilisateur sur
/// le mini canvas dès qu'un filtre est sélectionné. `intensity` (0…1)
/// module l'amplitude de chaque modifier autour de l'identité.
private struct StoryMiniFilterModifier: ViewModifier {
    let filter: String?
    let intensity: Float

    func body(content: Content) -> some View {
        let i = Double(max(0, min(1, intensity)))
        switch filter {
        case "vintage":
            return AnyView(content
                .saturation(1.0 + 0.5 * i)
                .colorMultiply(Color(red: 0.95, green: 0.85, blue: 0.70).opacity(0.6 + 0.4 * i)))
        case "bw":
            return AnyView(content.grayscale(i))
        case "warm":
            return AnyView(content
                .hueRotation(.degrees(10 * i))
                .saturation(1.0 + 0.2 * i)
                .colorMultiply(Color(red: 1.0, green: 0.9, blue: 0.75).opacity(0.4 + 0.5 * i)))
        case "cool":
            return AnyView(content
                .hueRotation(.degrees(-10 * i))
                .saturation(1.0 + 0.15 * i)
                .colorMultiply(Color(red: 0.80, green: 0.92, blue: 1.0).opacity(0.4 + 0.5 * i)))
        case "dramatic":
            return AnyView(content
                .contrast(1.0 + 0.6 * i)
                .brightness(-0.05 * i))
        case "vivid":
            return AnyView(content.saturation(1.0 + 0.8 * i))
        case "fade":
            return AnyView(content
                .saturation(1.0 - 0.4 * i)
                .brightness(0.08 * i)
                .contrast(1.0 - 0.2 * i))
        case "chrome":
            return AnyView(content
                .saturation(1.0 - 0.15 * i)
                .contrast(1.0 + 0.15 * i))
        case .some, .none:
            return AnyView(content)
        }
    }
}

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
                foregroundMediaLayer(in: geo.size)
                textLayer(in: geo.size)
                stickerLayer(in: geo.size)
                // Le dessin est la couche la PLUS HAUTE — parité avec
                // `StoryRenderer` (overlay dessin à zPosition 9999, au-dessus de
                // texte/média/stickers) et avec le composite ThumbHash. Avant, le
                // `drawingLayer` était rendu en 2ᵉ position (sous média/texte) →
                // mini-preview incohérente avec le rendu réel (2026-06-01).
                drawingLayer
            }
            // Approximation des filtres `slide.effects.filter` via les
            // modifiers SwiftUI natifs (GPU, ~0 cost à cette taille). Le main
            // canvas n'applique que `vintage` + `bwContrast` via Metal — mais
            // la grille de sélection propose 8 filtres, donc on en map tous
            // les 8 ici pour que la sélection ait au moins un retour visuel
            // sur le mini canvas (bug 2026-05-27 : « les effets doivent être
            // visibles sur le canvas et le mini canvas »). Les badges
            // (index / dot bg) restent au-dessus, non filtrés.
            .modifier(StoryMiniFilterModifier(filter: effects.filter,
                                              intensity: Float(effects.filterIntensity ?? 1.0)))
            ZStack {
                indexBadge
                bgColorDot(in: geo.size)
            }
        }
        .clipped()
    }

    // MARK: - Background Layers

    @ViewBuilder
    private func backgroundLayers(in size: CGSize) -> some View {
        // Layer 0: Background color — UNIQUEMENT sans fond visuel de fond. Avec un
        // média de fond (image/vidéo) ou un fond legacy `bgImage`, pas de fond coloré
        // (user 2026-06-03) : base neutre noire, le média couvre par-dessus.
        if effects.hasVisualBackgroundMedia || bgImage != nil {
            Color.black
        } else if let bg = effects.background {
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
        // Vaut pour IMAGE **et VIDÉO** : la vidéo de fond porte sa poster frame dans
        // `loadedImages[bgMedia.id]` (parité avec le composite ThumbHash et le canvas).
        // Sans ça la mini-preview d'une story à fond vidéo n'affichait que la couleur
        // de fond + overlays — désync avec le canvas qui joue la vidéo.
        if let bgMedia = effects.resolvedBackgroundMedia,
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
        // Bridge dessin (2026-05-30) : format moderne `drawingStrokes` rendu via
        // `MeeshyStrokeCanvas` (positionnement design-space exact dans le cadre 9:16),
        // fallback legacy `drawingData` (PKDrawing croppé) sinon.
        if let strokes = effects.drawingStrokes, !strokes.isEmpty {
            MeeshyStrokeCanvas(strokes: strokes, selectedId: nil)
        } else if let data = drawingData,
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
            // Parité avec le canvas réel (`StoryMediaLayer`) : la taille de base
            // vient de `baseMediaDesignSize(aspectRatio:)` (≈ 0,5–0,65 × designWidth,
            // enveloppe respectant l'aspect ratio) projetée par `width / 1080`.
            // L'ancien heuristique `0,35 × width` carré + `scaledToFit` rendait le
            // média ~moitié trop petit et au mauvais ratio vs reader/preview.
            let base = StoryMediaLayer.baseMediaDesignSize(aspectRatio: media.aspectRatio)
            let factor = size.width / CanvasGeometry.designWidth
            Image(uiImage: img)
                .resizable()
                .scaledToFill()
                .frame(width: base.width * factor * CGFloat(media.scale),
                       height: base.height * factor * CGFloat(media.scale))
                .clipped()
                .rotationEffect(.degrees(Double(media.rotation)))
                .position(x: CGFloat(media.x) * size.width,
                          y: CGFloat(media.y) * size.height)
        }
    }

    // MARK: - Text Layer

    @ViewBuilder
    private func textLayer(in size: CGSize) -> some View {
        let texts = effects.textObjects
        ForEach(texts) { text in
            textItem(text, in: size)
        }
    }

    @ViewBuilder
    private func textItem(_ text: StoryTextObject, in size: CGSize) -> some View {
        // Parité avec le canvas réel (`StoryTextLayer`) : la police est exprimée en
        // espace design (référence 1080 = `CanvasGeometry.designWidth`) et projetée
        // par `scaleFactor = width / 1080`. L'ancien diviseur `393` (largeur device
        // iPhone 14 Pro, pas la référence design) rendait le texte 2,75× trop gros
        // par rapport au reader/preview. Le clamp `max(3, …)` garde un plancher
        // lisible sur les très petites vignettes.
        let fontSize = CGFloat(max(3, text.fontSize * Double(size.width) / Double(CanvasGeometry.designWidth)))
        Text(text.text.isEmpty ? " " : text.text)
            .font(.system(size: fontSize, weight: .medium))
            .foregroundColor(Color(hex: text.textColor ?? "FFFFFF"))
            .lineLimit(1)
            // Fond du texte — parité avec le canvas (`StoryTextLayer`) et le
            // composite ThumbHash. Sans ça la mini-preview montrait les glyphes nus
            // (souvent illisibles sur un fond de slide clair) alors que le canvas
            // affiche la boîte colorée — incohérence strip ↔ canvas (bug 2026-06-01).
            .padding(.horizontal, max(0.5, fontSize * 0.16))
            .padding(.vertical, max(0.5, fontSize * 0.08))
            .background(miniTextBackground(for: text, fontSize: fontSize))
            .scaleEffect(CGFloat(text.scale))
            .rotationEffect(.degrees(text.rotation))
            .position(x: CGFloat(text.x) * size.width,
                      y: CGFloat(text.y) * size.height)
    }

    /// Fond de la boîte de texte dans la mini-preview, dérivé du
    /// `resolvedBackgroundStyle` (source de vérité partagée avec le canvas) — et
    /// NON du seul champ legacy `textBg`. `.glass` est approximé par un material.
    @ViewBuilder
    private func miniTextBackground(for text: StoryTextObject, fontSize: CGFloat) -> some View {
        let radius = max(1, (fontSize + 2) * 0.18)
        switch text.resolvedBackgroundStyle {
        case .none:
            Color.clear
        case .solid(let hex):
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(Color(hex: hex))
        case .glass:
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(.ultraThinMaterial)
        }
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
