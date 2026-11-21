import SwiftUI

// MARK: - Le statut

/// Ce qu'une vignette montre de son statut, PAR-DESSUS le contenu de l'hôte :
/// l'anneau K09 d'un envoi ou d'une préparation, le voile et le glyphe d'une
/// attente ou d'un échec. Une vignette prête ne montre rien. Masqué aux lecteurs
/// d'écran : la valeur dite de la vignette porte le statut.
struct MeeshyThumbnailStatusOverlay: View {
    let status: MeeshyThumbnailStatus
    let size: CGSize
    let tone: MeeshyGlassTone

    /// Le diamètre de l'anneau : 22, ou la largeur de la vignette moins 4.
    static func ringDiameter(for size: CGSize) -> CGFloat {
        min(MeeshyThumbnailRowRecipe.statusRing, size.width - MeeshyThumbnailRowRecipe.statusRingMargin)
    }

    var body: some View {
        layer
            .frame(width: size.width, height: size.height)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private var layer: some View {
        switch status {
        case .ready:
            EmptyView()
        case .preparing:
            MeeshyProgressRing(
                progress: nil, label: nil, diameter: Self.ringDiameter(for: size), scrim: true, tone: tone
            )
        case .sending(let progress):
            MeeshyProgressRing(
                progress: progress, label: nil, diameter: Self.ringDiameter(for: size), scrim: true, tone: tone
            )
        case .waiting:
            veiled(symbol: "timer")
        case .failed:
            veiled(symbol: "exclamationmark.triangle.fill")
        }
    }

    private func veiled(symbol: String) -> some View {
        ZStack {
            Rectangle().fill(MeeshyColors.mediaBackdrop.opacity(MeeshyThumbnailRowRecipe.waitingVeil))
            Image(systemName: symbol)
                .font(Font.system(size: MeeshyThumbnailRowRecipe.waitingGlyph, weight: .semibold))
                .foregroundStyle(MeeshyColors.onMedia)
        }
    }
}

// MARK: - Le « + »

/// Le « + » : à la taille d'une vignette, un voile sombre, un filet blanc, sans
/// verre ni échelle (il s'appuie à 85 %). Il vit dans une cellule du pas d'une
/// vignette : aucune zone morte entre les deux.
struct MeeshyThumbnailAddButton: View {
    let size: CGSize
    let pitch: CGFloat
    let tone: MeeshyGlassTone
    let name: String
    let isPressedPreview: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) { EmptyView() }
            .buttonStyle(MeeshyThumbnailAddStyle(size: size, pitch: pitch, tone: tone, forcedPressed: isPressedPreview))
            .accessibilityLabel(name)
    }
}

struct MeeshyThumbnailAddStyle: ButtonStyle {
    let size: CGSize
    let pitch: CGFloat
    let tone: MeeshyGlassTone
    let forcedPressed: Bool

    func makeBody(configuration: Configuration) -> some View {
        MeeshyThumbnailAddFace(
            size: size, pitch: pitch, tone: tone, isPressed: configuration.isPressed || forcedPressed
        )
    }
}

struct MeeshyThumbnailAddFace: View {
    let size: CGSize
    let pitch: CGFloat
    let tone: MeeshyGlassTone
    let isPressed: Bool

    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        let recipe = MeeshyThumbnailRowRecipe.resolve(tone: tone, isCurrent: false, isLifted: false)
        let isDark = colorScheme == .dark
        let ink = recipe.inkColor(isDark: isDark)
        let shape = RoundedRectangle(cornerRadius: MeeshyThumbnailRowRecipe.radius, style: .continuous)
        return ZStack {
            shape.fill(recipe.plusVeilColor(isDark: isDark))
            shape.strokeBorder(ink.opacity(MeeshyThumbnailRowRecipe.plusStrokeOpacity), lineWidth: MeeshyThumbnailRowRecipe.plusStroke)
            Image(systemName: "plus")
                .font(Font.system(size: MeeshyThumbnailRowRecipe.plusGlyph, weight: .semibold))
                .foregroundStyle(ink)
        }
        .frame(width: size.width, height: size.height)
        .opacity(MeeshyThumbnailRowRecipe.plusOpacity(isPressed: isPressed, isHovered: false))
        .frame(width: pitch, height: max(size.height, MeeshyThumbnailRowRecipe.targetHeight))
        .contentShape(Rectangle())
    }
}

// MARK: - La coche

/// La coche d'une vignette cochée (#19609) : un disque de 24 à la couleur de marque, glyphe de 12, filet de fond. Pas
/// une cible : toucher la vignette la décoche, et le trait « sélectionné » de la vignette la dit.
struct MeeshyThumbnailCheck: View {
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        let isDark = colorScheme == .dark
        return ZStack {
            Circle().fill(MeeshyColors.brandPrimary)
            Circle().strokeBorder(MeeshyColors.surfaceFill(isDark: isDark), lineWidth: MeeshyThumbnailRowRecipe.crossStroke)
            Image(systemName: "checkmark")
                .font(Font.system(size: MeeshyThumbnailRowRecipe.checkGlyph, weight: .bold))
                .foregroundStyle(MeeshyColors.onMedia)
        }
        .frame(width: MeeshyThumbnailRowRecipe.checkDisc, height: MeeshyThumbnailRowRecipe.checkDisc)
        .accessibilityHidden(true)
    }
}

// MARK: - La face TEXTE

/// La face TEXTE d'une vignette (#19609) : un extrait sur trois lignes au plus, et sa date en pied. Le contenu que
/// l'hôte rend dans `content(item, state)` quand la vignette représente un message et non une image ; masquée aux
/// lecteurs d'écran, la vignette disant elle-même son nom.
public struct MeeshyThumbnailExcerpt: View {
    private let text: String
    private let caption: String

    @Environment(\.colorScheme) private var colorScheme

    public init(text: String, caption: String) {
        self.text = text
        self.caption = caption
    }

    public var body: some View {
        let isDark = colorScheme == .dark
        return VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(verbatim: text)
                .meeshyScaledFont(MeeshyFont.subheadSize)
                .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)
            Spacer(minLength: 0)
            Text(verbatim: caption)
                .meeshyScaledFont(MeeshyFont.footnoteSize, weight: .semibold)
                .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                .lineLimit(1)
        }
        .padding(MeeshySpacing.sm)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(MeeshyColors.surfaceFill(isDark: isDark))
        .accessibilityHidden(true)
    }
}
