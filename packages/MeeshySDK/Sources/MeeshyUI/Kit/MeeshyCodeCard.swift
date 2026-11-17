import SwiftUI

/// **La carte de code (K31)** : un QR sur une plaque toujours claire, dans une
/// carte de verre qui suit l'inclinaison du téléphone. Tu donnes une chaîne, une
/// teinte et une légende ; elle ne sait pas ce que le code ouvre.
///
/// Le `payload` n'est jamais lu, journalisé ni mis dans un nom accessible : l'image
/// est nommée par `label`, sa valeur est `caption`, et l'hôte offre toujours la
/// même adresse en texte. L'inclinaison n'est jamais le seul moyen de voir quoi
/// que ce soit : sous « réduire les animations », sans capteur ou en `mini` et
/// `plain`, la carte reste droite, sans reflet. Sans `payload`, un squelette tient
/// la place finale. Avec `onPress`, c'est un bouton (cible de 44 au moins).
public struct MeeshyCodeCard<Center: View, Header: View>: View {
    private let payload: String?
    private let label: String
    private let caption: String?
    private let tint: Color?
    private let style: MeeshyCodeCardStyle
    private let size: MeeshyCodeCardSize
    private let tilt: MeeshyCodeCardTilt
    private let boostsBrightness: Bool
    private let onPress: (() -> Void)?
    private let center: Center
    private let header: Header

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @StateObject private var sensor = MeeshyDeviceTilt()
    @State private var pointerYaw: Double = 0

    public init(payload: String?,
                label: String,
                caption: String? = nil,
                tint: Color? = nil,
                style: MeeshyCodeCardStyle = .glass,
                size: MeeshyCodeCardSize = .large,
                tilt: MeeshyCodeCardTilt = .device,
                boostsBrightness: Bool = true,
                onPress: (() -> Void)? = nil,
                @ViewBuilder center: () -> Center,
                @ViewBuilder header: () -> Header) {
        self.payload = payload
        self.label = label
        self.caption = caption
        self.tint = tint
        self.style = style
        self.size = size
        self.tilt = tilt
        self.boostsBrightness = boostsBrightness
        self.onPress = onPress
        self.center = center()
        self.header = header()
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    private var recipe: MeeshyCodeCardRecipe {
        MeeshyCodeCardRecipe.resolve(style: style, size: size, tilt: tilt, isReady: payload != nil,
                                     reduceMotion: reduceMotion)
    }

    private func motion(for recipe: MeeshyCodeCardRecipe) -> MeeshyCodeCardMotion {
        switch recipe.tilt {
        case .none: return .flat
        case .device: return MeeshyCodeCardRecipe.motion(yaw: sensor.degrees, pitch: 0)
        case .pointer: return MeeshyCodeCardRecipe.motion(yaw: pointerYaw, pitch: 0)
        }
    }

    public var body: some View {
        let recipe = self.recipe
        let motion = self.motion(for: recipe)
        return Group {
            if let onPress {
                Button(action: onPress) { card(recipe: recipe, motion: motion) }
                    .buttonStyle(.plain)
                    .frame(minWidth: 44, minHeight: 44)
            } else {
                card(recipe: recipe, motion: motion)
            }
        }
        .background(MeeshyCodeScreenBrightness(isActive: boostsBrightness && payload != nil && recipe.size != .mini))
        .onAppear { if recipe.tilt == .device { sensor.start() } }
        .onDisappear { sensor.stop() }
        .adaptiveOnChange(of: recipe.tilt) { _, kind in
            if kind == .device { sensor.start() } else { sensor.stop() }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(caption ?? "")
        .accessibilityAddTraits(onPress == nil ? .isImage : [.isImage, .isButton])
    }

    private func card(recipe: MeeshyCodeCardRecipe, motion: MeeshyCodeCardMotion) -> some View {
        let cardShape = RoundedRectangle(cornerRadius: CGFloat(MeeshyCodeCardRecipe.cardRadius), style: .continuous)
        return VStack(spacing: 18) {
            if recipe.size != .mini { header }
            plate(recipe: recipe, motion: motion)
            if recipe.hasCaption, let caption {
                Text(caption)
                    .font(MeeshyFont.relative(14, weight: .regular, design: .monospaced))
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .environment(\.layoutDirection, .leftToRight)
            }
        }
        .padding(recipe.size == .mini ? EdgeInsets() : EdgeInsets(top: 22, leading: 24, bottom: 20, trailing: 24))
        .frame(width: CGFloat(recipe.cardWidth))
        .modifier(MeeshyCodeCardSurface(recipe: recipe, shape: cardShape))
        .overlay { if recipe.hasReflection { reflection(motion: motion, shape: cardShape) } }
        .rotation3DEffect(.degrees(motion.yaw), axis: (x: 0, y: 1, z: 0), perspective: 0.6)
        .rotation3DEffect(.degrees(motion.pitch), axis: (x: 1, y: 0, z: 0), perspective: 0.6)
        .onContinuousHover { phase in
            guard recipe.tilt == .pointer else { return }
            if case .active(let location) = phase {
                pointerYaw = (Double(location.x) / recipe.cardWidth - 0.5) * 2 * MeeshyCodeCardRecipe.yawLimit
            } else {
                pointerYaw = 0
            }
        }
    }

    private func plate(recipe: MeeshyCodeCardRecipe, motion: MeeshyCodeCardMotion) -> some View {
        let plateShape = RoundedRectangle(cornerRadius: CGFloat(recipe.plateRadius), style: .continuous)
        let plateColor = MeeshyCodeCardRecipe.plateColor(style: recipe.style).color
        let centerSide = MeeshyCodeCardRecipe.centerSide(forSide: recipe.side)
        return ZStack {
            if payload == nil || recipe.showsSkeleton {
                MeeshySkeleton(shape: .card(aspect: 1, radius: 14))
                    .frame(width: CGFloat(recipe.side), height: CGFloat(recipe.side))
            } else {
                MeeshyCodeMatrix(payload: payload, label: label, tint: tint, side: recipe.side)
                    .accessibilityHidden(true)
                if recipe.hasCenter {
                    center
                        .frame(width: CGFloat(centerSide), height: CGFloat(centerSide))
                        .background(plateColor, in: Circle())
                        .clipShape(Circle())
                        .offset(x: CGFloat(motion.centerShift - motion.plateShift))
                }
            }
        }
        .padding(CGFloat(recipe.plateMargin))
        .background(plateShape.fill(plateColor))
        .offset(x: CGFloat(motion.plateShift))
    }

    private func reflection(motion: MeeshyCodeCardMotion, shape: RoundedRectangle) -> some View {
        GeometryReader { proxy in
            LinearGradient(colors: [.clear, Color.white.opacity(0.18), .clear], startPoint: .leading, endPoint: .trailing)
                .frame(width: proxy.size.width / 4)
                .rotationEffect(.degrees(18))
                .offset(x: proxy.size.width * CGFloat(motion.reflectionPosition / 100) - proxy.size.width / 8)
                .frame(maxHeight: .infinity)
        }
        .clipShape(shape)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// La surface : le verre de K01 ou, en `plain`, la plaque claire sans verre.
private struct MeeshyCodeCardSurface: ViewModifier {
    let recipe: MeeshyCodeCardRecipe
    let shape: RoundedRectangle

    func body(content: Content) -> some View {
        if recipe.isGlass {
            content.meeshyGlass(in: shape)
        } else if recipe.style == .plain {
            content.background(shape.fill(MeeshyCodeCardRecipe.plateColor(style: .plain).color))
        } else {
            content
        }
    }
}

extension MeeshyCodeCard where Center == EmptyView, Header == EmptyView {
    public init(payload: String?,
                label: String,
                caption: String? = nil,
                tint: Color? = nil,
                style: MeeshyCodeCardStyle = .glass,
                size: MeeshyCodeCardSize = .large,
                tilt: MeeshyCodeCardTilt = .device,
                boostsBrightness: Bool = true,
                onPress: (() -> Void)? = nil) {
        self.init(payload: payload, label: label, caption: caption, tint: tint, style: style, size: size,
                  tilt: tilt, boostsBrightness: boostsBrightness, onPress: onPress,
                  center: { EmptyView() }, header: { EmptyView() })
    }
}
