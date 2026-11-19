import SwiftUI

/// **Le bloc d'état (K38)** : vide, erreur, refus, hors ligne et succès ont une
/// seule forme : une image fantôme, un titre, une phrase, une sortie. Il dessine
/// l'absence, il ne la décide pas : l'app lit son état, choisit le genre et passe
/// les mots et les actions. Pendant l'attente, c'est `MeeshySkeleton` qui tient la place.
///
/// Une erreur a toujours une sortie, un vide plein écran aussi : `MeeshyStateBlockRecipe`
/// refuse le bloc sinon (rien n'est dessiné et, en DEBUG, l'oubli se dit).
public struct MeeshyStateBlock<Glyph: View>: View {
    private let kind: MeeshyStateBlockKind
    private let title: String
    private let message: String?
    private let primary: MeeshyStateBlockAction?
    private let secondary: MeeshyStateBlockAction?
    private let art: MeeshyStateArt
    private let size: MeeshyStateBlockSize
    private let tint: Color?
    private let consequences: [String]
    private let isOverContent: Bool
    private let announces: Bool
    private let label: String?
    private let systemImage: String?
    private let glyph: Glyph

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @State private var floats = false

    public init(kind: MeeshyStateBlockKind,
                title: String,
                message: String? = nil,
                primary: MeeshyStateBlockAction? = nil,
                secondary: MeeshyStateBlockAction? = nil,
                art: MeeshyStateArt = .ghost(.row, count: 3),
                size: MeeshyStateBlockSize = .regular,
                tint: Color? = nil,
                consequences: [String] = [],
                isOverContent: Bool = false,
                announces: Bool = true,
                label: String? = nil,
                systemImage: String? = nil,
                @ViewBuilder glyph: () -> Glyph) {
        self.kind = kind
        self.title = title
        self.message = message
        self.primary = primary
        self.secondary = secondary
        self.art = art
        self.size = size
        self.tint = tint
        self.consequences = MeeshyStateBlockRecipe.shownConsequences(consequences, kind: kind)
        self.isOverContent = isOverContent
        self.announces = announces
        self.label = label
        self.systemImage = systemImage
        self.glyph = glyph()
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    private var recipe: MeeshyStateBlockRecipe? {
        MeeshyStateBlockRecipe.resolve(
            kind: kind, size: size, hasPrimary: primary != nil, hasSecondary: secondary != nil,
            hasMessage: !(message ?? "").isEmpty, isPending: primary?.isPending ?? false,
            isOverContent: isOverContent, isDark: colorScheme == .dark, reduceTransparency: reduceTransparency)
    }

    public var body: some View {
        if let recipe {
            Group {
                if size == .compact { compact(recipe) } else { regular(recipe) }
            }
            .accessibilityElement(children: .contain)
            .onAppear { announceIfNeeded(recipe) }
            .adaptiveOnChange(of: kind) { old, new in
                guard MeeshyStateBlockRecipe.announcesTransition(from: old, to: new) else { return }
                announceIfNeeded(recipe)
            }
        } else {
            Color.clear.frame(width: 0, height: 0).onAppear { assertMissingExit() }
        }
    }

    private func toneColor(_ recipe: MeeshyStateBlockRecipe) -> Color {
        let isDark = colorScheme == .dark
        switch recipe.tone {
        case .accent: return tint ?? MeeshyColors.brandPrimary
        case .error: return MeeshyColors.error
        case .warning: return MeeshyColors.warning
        case .neutral: return MeeshyColors.textSecondary(isDark: isDark)
        case .success: return MeeshyColors.success
        }
    }

    private func regular(_ recipe: MeeshyStateBlockRecipe) -> some View {
        let color = toneColor(recipe)
        let isDark = colorScheme == .dark
        return VStack(spacing: MeeshySpacing.lg) {
            if recipe.showsArt { artView(recipe, color: color) }
            VStack(spacing: MeeshySpacing.sm) {
                Text(verbatim: title)
                    .meeshyScaledFont(MeeshyFont.titleSize, weight: .heavy, design: .rounded)
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                    .multilineTextAlignment(.center)
                    .lineLimit(MeeshyStateBlockRecipe.titleMaxLines)
                if recipe.showsMessage, let message {
                    Text(verbatim: message)
                        .meeshyScaledFont(MeeshyFont.labelSize)
                        .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: CGFloat(MeeshyStateBlockRecipe.messageMaxWidth))
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(label ?? [title, message].compactMap { $0 }.joined(separator: ". "))
            .accessibilityAddTraits(.isHeader)
            consequenceLines(color: color)
            actions(recipe, color: color)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, MeeshySpacing.xl)
    }

    private func compact(_ recipe: MeeshyStateBlockRecipe) -> some View {
        let color = toneColor(recipe)
        let isDark = colorScheme == .dark
        return HStack(spacing: MeeshySpacing.md) {
            Image(systemName: MeeshyStateBlockRecipe.glyph(of: kind, override: systemImage)).foregroundStyle(color)
                .accessibilityHidden(true)
            Text(verbatim: title)
                .meeshyScaledFont(MeeshyFont.labelSize, weight: .semibold)
                .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                .lineLimit(1)
            Spacer(minLength: MeeshySpacing.sm)
            if let action = primary ?? (recipe.secondaryIsPromoted ? secondary : nil) {
                Button(action: action.perform) {
                    Text(verbatim: action.title).meeshyScaledFont(MeeshyFont.labelSize, weight: .semibold)
                }
                .disabled(action.isPending)
                .frame(minHeight: CGFloat(MeeshyControlSize.tapTarget))
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .frame(minHeight: CGFloat(recipe.rowHeight ?? MeeshyStateBlockRecipe.compactRowHeight))
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                .strokeBorder(Color.secondary.opacity(MeeshyOpacity.medium), style: StrokeStyle(lineWidth: MeeshyBorder.emphasis, dash: [4, 3]))
        )
    }

    @ViewBuilder
    private func artView(_ recipe: MeeshyStateBlockRecipe, color: Color) -> some View {
        ZStack {
            if recipe.showsHalo {
                Circle().fill(color.opacity(MeeshyOpacity.medium)).frame(width: 120, height: 120).blur(radius: 28)
            }
            VStack(spacing: MeeshySpacing.md) {
                switch art {
                case .ghost(let template, let count): ghosts(template, count: MeeshyStateBlockRecipe.ghostCount(count))
                case .ghostTiles(let tiles): ghostTiles(MeeshyStateBlockRecipe.shownGhostTiles(tiles), color: color)
                case .glyph: glyph
                case .none: EmptyView()
                }
                glyphDisc(recipe, color: color)
            }
        }
        .frame(maxHeight: CGFloat(MeeshyStateBlockRecipe.artMaxHeight) + 80)
        .accessibilityHidden(true)
    }

    private func glyphDisc(_ recipe: MeeshyStateBlockRecipe, color: Color) -> some View {
        Circle()
            .strokeBorder(color, style: StrokeStyle(lineWidth: MeeshyBorder.emphasis, dash: [4, 3]))
            .frame(width: CGFloat(MeeshyStateBlockRecipe.glyphDiameter), height: CGFloat(MeeshyStateBlockRecipe.glyphDiameter))
            .overlay(Image(systemName: MeeshyStateBlockRecipe.glyph(of: kind, override: systemImage))
                .font(MeeshyFont.relative(CGFloat(MeeshyStateBlockRecipe.glyphSize)))
                .foregroundStyle(color))
            .offset(y: floats && !reduceMotion ? -CGFloat(MeeshyStateBlockRecipe.glyphFloat) : 0)
            .animation(MeeshyStateBlockRecipe.floatAnimation(reduce: reduceMotion), value: floats)
            .onAppear { floats = true }
    }

    private func ghosts(_ template: MeeshyStateGhostTemplate, count: Int) -> some View {
        let height: CGFloat = template == .tile ? 72 : (template == .ticket ? 64 : 44)
        let shape = template == .pin ? AnyShape(Circle()) : AnyShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous))
        return VStack(spacing: MeeshySpacing.sm) {
            ForEach(0..<count, id: \.self) { _ in
                shape
                    .fill(Color.secondary.opacity(MeeshyOpacity.faint))
                    .overlay(shape.stroke(Color.secondary.opacity(MeeshyOpacity.light),
                                                style: StrokeStyle(lineWidth: MeeshyBorder.emphasis, dash: [4, 3])))
                    .frame(width: template == .pin ? height : nil, height: height)
            }
        }
    }

    /// Une rangée de tuiles pointillées, chacune avec son glyphe teinté et sa légende ; muettes (l'image entière est
    /// cachée au lecteur d'écran : le titre du bloc la dit).
    private func ghostTiles(_ tiles: [MeeshyStateGhostTile], color: Color) -> some View {
        let shape = RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
        return HStack(spacing: MeeshySpacing.sm) {
            ForEach(tiles, id: \.self) { tile in
                VStack(spacing: MeeshySpacing.xs) {
                    Image(systemName: tile.systemImage)
                        .meeshyScaledFont(MeeshyFont.headlineSize, weight: .semibold)
                        .foregroundStyle(color)
                    Text(verbatim: tile.caption)
                        .meeshyScaledFont(MeeshyFont.captionSize, weight: .semibold)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .frame(maxWidth: .infinity, minHeight: 72)
                .padding(.horizontal, MeeshySpacing.xs)
                .background(shape.fill(Color.secondary.opacity(MeeshyOpacity.faint)))
                .overlay(shape.strokeBorder(Color.secondary.opacity(MeeshyOpacity.light),
                                            style: StrokeStyle(lineWidth: MeeshyBorder.emphasis, dash: [4, 3])))
            }
        }
    }

    @ViewBuilder
    private func consequenceLines(color: Color) -> some View {
        if !consequences.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                ForEach(Array(consequences.enumerated()), id: \.offset) { _, line in
                    Label { Text(verbatim: line).meeshyScaledFont(MeeshyFont.labelSize) } icon: {
                        Image(systemName: MeeshyStateBlockRecipe.consequenceSystemImage(of: kind)).foregroundStyle(color)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func actions(_ recipe: MeeshyStateBlockRecipe, color: Color) -> some View {
        VStack(spacing: MeeshySpacing.xs) {
            if let primary { primaryButton(primary, recipe: recipe, color: color) }
            if let secondary { secondaryButton(secondary, recipe: recipe, color: color, promoted: recipe.secondaryIsPromoted) }
        }
    }

    private func primaryButton(_ action: MeeshyStateBlockAction, recipe: MeeshyStateBlockRecipe, color: Color) -> some View {
        Button(action: action.perform) {
            HStack(spacing: MeeshySpacing.sm) {
                if action.isPending { ProgressView() } else if let image = action.systemImage { Image(systemName: image) }
                Text(verbatim: action.title).meeshyScaledFont(MeeshyFont.bodySize, weight: .semibold)
            }
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity)
            .frame(height: CGFloat(recipe.primaryHeight))
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                .fill(kind == .empty ? (tint ?? MeeshyColors.brandPrimary) : MeeshyColors.brandPrimary))
        }
        .buttonStyle(.plain)
        .disabled(!recipe.primaryIsEnabled)
        .accessibilityLabel(action.title)
        .accessibilityValue(action.isPending ? "…" : "")
    }

    private func secondaryButton(_ action: MeeshyStateBlockAction, recipe: MeeshyStateBlockRecipe, color: Color, promoted: Bool) -> some View {
        Button(action: action.perform) {
            Text(verbatim: action.title)
                .meeshyScaledFont(MeeshyFont.bodySize, weight: .semibold)
                .foregroundStyle(MeeshyColors.brandPrimary)
                .frame(maxWidth: .infinity)
                .frame(height: CGFloat(promoted ? recipe.primaryHeight : recipe.secondaryHeight))
        }
        .buttonStyle(.plain)
    }

    private func announceIfNeeded(_ recipe: MeeshyStateBlockRecipe) {
        guard announces, recipe.announcesOnAppear else { return }
        if recipe.hapticOnEnter { HapticFeedback.error() }
        AdaptiveAccessibility.announce(label ?? title, priority: recipe.kind == .error ? .high : .normal)
    }

    private func assertMissingExit() {
        #if DEBUG
        assertionFailure("MeeshyStateBlock : un genre \(kind) plein écran exige une sortie principale")
        #endif
    }
}

extension MeeshyStateBlock where Glyph == EmptyView {
    public init(kind: MeeshyStateBlockKind,
                title: String,
                message: String? = nil,
                primary: MeeshyStateBlockAction? = nil,
                secondary: MeeshyStateBlockAction? = nil,
                art: MeeshyStateArt = .ghost(.row, count: 3),
                size: MeeshyStateBlockSize = .regular,
                tint: Color? = nil,
                consequences: [String] = [],
                isOverContent: Bool = false,
                announces: Bool = true,
                label: String? = nil,
                systemImage: String? = nil) {
        self.init(kind: kind, title: title, message: message, primary: primary, secondary: secondary, art: art,
                  size: size, tint: tint, consequences: consequences, isOverContent: isOverContent,
                  announces: announces, label: label, systemImage: systemImage, glyph: { EmptyView() })
    }
}
