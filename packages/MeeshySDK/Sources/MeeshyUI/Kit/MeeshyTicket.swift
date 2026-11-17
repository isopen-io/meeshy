import SwiftUI

/// **Le billet (K30)** : une carte, deux encoches, un pointillé de coupe. Au-dessus,
/// ce que c'est ; dessous, ce qu'on en fait ; derrière, le verso.
///
/// Agnostique : des chaînes déjà écrites, une teinte, un glyphe et cinq
/// emplacements (`stub`, `leading`, `trailing`, `status`, `back`). Il ne copie
/// rien, n'ouvre rien, ne compte rien : `onPress` appartient à l'hôte, et les
/// boutons du talon gardent leur propre cible (la presse du billet est posée
/// DERRIÈRE le contenu). `isFlipped` est la seule cause du retournement ; le côté
/// caché n'est ni touchable ni lu.
public struct MeeshyTicket<Stub: View, Leading: View, Trailing: View, Status: View, Back: View>: View {
    private let title: String
    private let code: String
    private let tint: Color?
    private let systemImage: String?
    private let figure: String?
    private let figureCaption: String?
    private let size: MeeshyTicketSize
    private let kind: MeeshyTicketKind
    private let isFlipped: Bool
    private let isSelected: Bool
    private let isDragging: Bool
    private let label: String?
    private let statusLabel: String?
    private let flipLabels: (front: String, back: String)?
    private let onPress: (() -> Void)?
    private let stub: Stub
    private let leading: Leading
    private let trailing: Trailing
    private let status: Status
    private let back: Back

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @State private var measuredCut: Double?
    @State private var hasShownBack = false

    public init(title: String,
                code: String,
                tint: Color? = nil,
                systemImage: String? = nil,
                figure: String? = nil,
                figureCaption: String? = nil,
                size: MeeshyTicketSize = .row,
                kind: MeeshyTicketKind = .normal,
                isFlipped: Bool = false,
                isSelected: Bool = false,
                isDragging: Bool = false,
                label: String? = nil,
                statusLabel: String? = nil,
                flipLabels: (front: String, back: String)? = nil,
                onPress: (() -> Void)? = nil,
                @ViewBuilder stub: () -> Stub,
                @ViewBuilder leading: () -> Leading,
                @ViewBuilder trailing: () -> Trailing,
                @ViewBuilder status: () -> Status,
                @ViewBuilder back: () -> Back) {
        self.title = title
        self.code = code
        self.tint = tint
        self.systemImage = systemImage
        self.figure = figure
        self.figureCaption = figureCaption
        self.size = size
        self.kind = kind
        self.isFlipped = isFlipped
        self.isSelected = isSelected
        self.isDragging = isDragging
        self.label = label
        self.statusLabel = statusLabel
        self.flipLabels = flipLabels
        self.onPress = onPress
        self.stub = stub()
        self.leading = leading()
        self.trailing = trailing()
        self.status = status()
        self.back = back()
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    private func recipe(isPressed: Bool) -> MeeshyTicketRecipe {
        MeeshyTicketRecipe.resolve(size: size, kind: kind, isSelected: isSelected, isPressed: isPressed,
                                   isDragging: isDragging, isFlipped: isFlipped, reduceMotion: reduceMotion)
    }

    private var spokenName: String {
        if let label { return label }
        return [title, code, figure, statusLabel].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
    }

    public var body: some View {
        let recipe = self.recipe(isPressed: false)
        ZStack {
            faceStack(recipe: recipe)
        }
        .frame(width: recipe.width.map { CGFloat($0) })
        .frame(maxWidth: recipe.width == nil ? CGFloat.infinity : nil)
        .rotationEffect(.degrees(recipe.tilt))
        .scaleEffect(CGFloat(isFlipped && !reduceMotion ? MeeshyTicketRecipe.flipLift : 1))
        .animation(MeeshyMotion.animation(.flip, reduce: reduceMotion), value: isFlipped)
        .adaptiveOnChange(of: isFlipped) { _, flipped in if flipped { hasShownBack = true } }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private func faceStack(recipe: MeeshyTicketRecipe) -> some View {
        let useRotation = recipe.flipRotation != 0 || (!reduceMotion)
        ZStack {
            front(recipe: recipe)
                .opacity(recipe.showsBack ? 0 : 1)
                .allowsHitTesting(!recipe.showsBack)
                .accessibilityHidden(recipe.showsBack)
                .rotation3DEffect(.degrees(useRotation && recipe.showsBack ? -180 : 0), axis: (x: 0, y: 1, z: 0))
            if recipe.showsBack || hasShownBack {
                backFace(recipe: recipe)
                    .opacity(recipe.showsBack ? 1 : 0)
                    .allowsHitTesting(recipe.showsBack)
                    .accessibilityHidden(!recipe.showsBack)
                    .rotation3DEffect(.degrees(useRotation && !recipe.showsBack ? 180 : 0), axis: (x: 0, y: 1, z: 0))
            }
        }
    }

    private func front(recipe: MeeshyTicketRecipe) -> some View {
        let isDark = colorScheme == .dark
        let cut = measuredCut ?? recipe.cut
        return ZStack {
            MeeshyTicketBackground(shape: MeeshyTicketShape(cut: CGFloat(cut)), recipe: recipe, tint: tint, size: size,
                                   isDark: isDark, isSelected: isSelected, onPress: onPress, label: spokenName)
            if recipe.showsContent {
                content(recipe: recipe, isDark: isDark)
            } else {
                MeeshySkeleton(shape: .ticket(cut: recipe.cut))
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func content(recipe: MeeshyTicketRecipe, isDark: Bool) -> some View {
        VStack(spacing: 0) {
            head(recipe: recipe, isDark: isDark)
                .padding(.horizontal, CGFloat(recipe.cutMargin))
                .padding(.vertical, MeeshySpacing.md)
                .frame(minHeight: CGFloat(recipe.cut))
                .background(GeometryReader { proxy in
                    Color.clear.preference(key: MeeshyTicketCutKey.self, value: Double(proxy.size.height))
                })
            if size != .mini {
                MeeshyTicketCutLine()
                    .stroke(style: StrokeStyle(lineWidth: CGFloat(recipe.dashLineWidth), dash: recipe.dashPattern.map { CGFloat($0) }))
                    .foregroundStyle(MeeshyColors.hairline(isDark: isDark))
                    .frame(height: CGFloat(recipe.dashLineWidth))
                    .padding(.horizontal, CGFloat(recipe.cutMargin))
                stubArea(recipe: recipe, isDark: isDark)
            }
        }
        .onPreferenceChange(MeeshyTicketCutKey.self) { measuredCut = size == .mini ? nil : $0 }
    }

    private func head(recipe: MeeshyTicketRecipe, isDark: Bool) -> some View {
        let struck = recipe.isStruck
        return HStack(spacing: MeeshySpacing.md) {
            leading
            pastille(recipe: recipe, isDark: isDark)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(MeeshyFont.relative(size == .hero ? 11 : 17, weight: .heavy, design: .rounded))
                    .foregroundStyle(size == .hero ? MeeshyColors.textMuted(isDark: isDark) : MeeshyColors.textPrimary(isDark: isDark))
                    .textCase(size == .hero ? .uppercase : nil)
                    .strikethrough(struck)
                    .lineLimit(1)
                if size != .mini {
                    Text(code)
                        .font(MeeshyFont.relative(CGFloat(recipe.codeFontSize), weight: .regular, design: .monospaced))
                        .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                        .strikethrough(struck)
                        .environment(\.layoutDirection, .leftToRight)
                        .lineLimit(2)
                }
                if size == .hero, let figure { figureText(figure, isDark: isDark) }
            }
            Spacer(minLength: 0)
            status
            trailing
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(spokenName)
    }

    @ViewBuilder
    private func pastille(recipe: MeeshyTicketRecipe, isDark: Bool) -> some View {
        if let systemImage, recipe.pastilleSize > 0 {
            let base = tint ?? Color.accentColor
            let ink = MeeshyTicketRecipe.ink(onTint: MeeshyKitRGB(color: base)).color
            Image(systemName: systemImage)
                .font(MeeshyKitFont.exact(recipe.glyphSize, weight: .semibold))
                .foregroundStyle(ink)
                .frame(width: CGFloat(recipe.pastilleSize), height: CGFloat(recipe.pastilleSize))
                .background(Circle().fill(base.opacity(recipe.isStruck ? 0.35 : 1)))
                .accessibilityHidden(true)
        }
    }

    private func figureText(_ value: String, isDark: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(value)
                .font(MeeshyFont.relative(size == .hero ? 26 : 20, weight: .heavy, design: .rounded))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
            if let figureCaption {
                Text(figureCaption)
                    .font(MeeshyFont.relative(12))
                    .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
            }
        }
    }

    private func stubArea(recipe: MeeshyTicketRecipe, isDark: Bool) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            if size == .row, let figure { figureText(figure, isDark: isDark) }
            stub
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, CGFloat(recipe.cutMargin))
        .padding(.vertical, MeeshySpacing.smPlus)
    }

    private func backFace(recipe: MeeshyTicketRecipe) -> some View {
        let isDark = colorScheme == .dark
        let cut = measuredCut ?? recipe.cut
        return ZStack {
            MeeshyTicketBackground(shape: MeeshyTicketShape(cut: CGFloat(cut)), recipe: recipe, tint: tint, size: size,
                                   isDark: isDark, isSelected: false, onPress: nil, label: spokenName)
            back
                .padding(CGFloat(recipe.cutMargin))
        }
    }
}

private struct MeeshyTicketCutKey: PreferenceKey {
    static let defaultValue: Double = 0
    static func reduce(value: inout Double, nextValue: () -> Double) {
        value = max(value, nextValue())
    }
}

/// Le fond du billet : fond, bord et — seulement avec `onPress` — la presse, posée
/// derrière le contenu pour que presser un bouton du talon ne presse pas le billet.
private struct MeeshyTicketBackground: View {
    let shape: MeeshyTicketShape
    let recipe: MeeshyTicketRecipe
    let tint: Color?
    let size: MeeshyTicketSize
    let isDark: Bool
    let isSelected: Bool
    let onPress: (() -> Void)?
    let label: String

    var body: some View {
        if let onPress {
            Button(action: onPress) { surface(recipe: recipe) }
                .buttonStyle(MeeshyTicketPressStyle(shape: shape, base: recipe, tint: tint, isDark: isDark, isSelected: isSelected))
                .accessibilityLabel(label)
        } else {
            surface(recipe: recipe)
        }
    }

    func surface(recipe: MeeshyTicketRecipe) -> some View {
        let fillColor: Color = {
            switch recipe.fill {
            case .raised: return MeeshyColors.backgroundSecondary(isDark: isDark)
            case .field: return MeeshyColors.controlFill(isDark: isDark)
            case .none: return .clear
            }
        }()
        let border = isSelected ? (tint ?? Color.accentColor) : MeeshyColors.hairline(isDark: isDark)
        return shape.fill(fillColor)
            .overlay {
                if recipe.isBorderDashed {
                    shape.stroke(border, style: StrokeStyle(lineWidth: CGFloat(recipe.borderWidth), dash: [6, 4]))
                } else {
                    shape.stroke(border, lineWidth: CGFloat(recipe.borderWidth))
                }
            }
            .contentShape(shape)
    }
}

private struct MeeshyTicketPressStyle: ButtonStyle {
    let shape: MeeshyTicketShape
    let base: MeeshyTicketRecipe
    let tint: Color?
    let isDark: Bool
    let isSelected: Bool

    func makeBody(configuration: Configuration) -> some View {
        let pressed = MeeshyTicketRecipe.resolve(size: base.size, kind: base.kind, isSelected: isSelected,
                                                 isPressed: configuration.isPressed)
        return MeeshyTicketBackground(shape: shape, recipe: pressed, tint: tint, size: base.size, isDark: isDark,
                                      isSelected: isSelected, onPress: nil, label: "")
            .scaleEffect(CGFloat(pressed.scale))
    }
}

extension MeeshyTicket where Stub == EmptyView, Leading == EmptyView, Trailing == EmptyView,
                              Status == EmptyView, Back == EmptyView {
    public init(title: String,
                code: String,
                tint: Color? = nil,
                systemImage: String? = nil,
                figure: String? = nil,
                figureCaption: String? = nil,
                size: MeeshyTicketSize = .row,
                kind: MeeshyTicketKind = .normal,
                isSelected: Bool = false,
                label: String? = nil,
                statusLabel: String? = nil,
                onPress: (() -> Void)? = nil) {
        self.init(title: title, code: code, tint: tint, systemImage: systemImage, figure: figure,
                  figureCaption: figureCaption, size: size, kind: kind, isFlipped: false, isSelected: isSelected,
                  isDragging: false, label: label, statusLabel: statusLabel, flipLabels: nil, onPress: onPress,
                  stub: { EmptyView() }, leading: { EmptyView() }, trailing: { EmptyView() },
                  status: { EmptyView() }, back: { EmptyView() })
    }
}
