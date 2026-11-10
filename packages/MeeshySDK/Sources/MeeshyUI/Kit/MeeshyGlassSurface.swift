import SwiftUI

// MARK: - Le verre du kit

/// L'UNIQUE entrée de verre du kit : elle choisit la matière selon l'appareil
/// (Liquid Glass du système sur iOS 26+, qui se givre lui-même sous « réduire la
/// transparence » ; dessous, verre dessiné, ou fond plein sous ce réglage), le
/// ton selon l'hôte, et elle répond au toucher.
///
/// Atome opaque, par pureté du SDK : l'appelant passe une forme et une teinte.
/// La surface ne pose ni action, ni nom accessible, ni retour haptique.
///
/// Appliquer en DERNIER dans la chaîne de modificateurs, après la taille. Pour
/// que le verre dessiné réponde à l'appui, la surface se pose DANS le libellé
/// d'un bouton en `MeeshyGlassPressStyle`, ou reçoit `isPressed`.
///
/// Passe par un `ViewModifier` : l'`if #available` reste dans `body(content:)`
/// (voir `adaptiveGlass`).
public extension View {
    func meeshyGlass<S: Shape>(
        in shape: S,
        tone: MeeshyGlassTone? = nil,
        density: MeeshyGlassDensity = .regular,
        tint: Color? = nil,
        isInteractive: Bool = false,
        isPressed: Bool? = nil
    ) -> some View {
        modifier(MeeshyGlassModifier(
            shape: shape, tone: tone, density: density, tint: tint,
            isInteractive: isInteractive, isPressed: isPressed
        ))
    }

    /// Pose le ton de l'hôte : toutes les surfaces dessous qui n'en déclarent
    /// pas le prennent. Défaut `.deep`.
    func meeshyGlassTone(_ tone: MeeshyGlassTone) -> some View {
        environment(\.meeshyGlassTone, tone)
    }
}

private struct MeeshyGlassToneKey: EnvironmentKey {
    static let defaultValue: MeeshyGlassTone = .deep
}

private struct MeeshyGlassIsPressedKey: EnvironmentKey {
    static let defaultValue = false
}

private struct MeeshyGlassIsNestedKey: EnvironmentKey {
    static let defaultValue = false
}

public extension EnvironmentValues {
    var meeshyGlassTone: MeeshyGlassTone {
        get { self[MeeshyGlassToneKey.self] }
        set { self[MeeshyGlassToneKey.self] = newValue }
    }

    /// Posé par `MeeshyGlassPressStyle` sur le libellé de son bouton.
    var meeshyGlassIsPressed: Bool {
        get { self[MeeshyGlassIsPressedKey.self] }
        set { self[MeeshyGlassIsPressedKey.self] = newValue }
    }

    /// Posé par un verre dessiné sur son contenu : jamais de verre sur du verre.
    var meeshyGlassIsNested: Bool {
        get { self[MeeshyGlassIsNestedKey.self] }
        set { self[MeeshyGlassIsNestedKey.self] = newValue }
    }
}

private struct MeeshyGlassModifier<S: Shape>: ViewModifier {
    let shape: S
    let tone: MeeshyGlassTone?
    let density: MeeshyGlassDensity
    let tint: Color?
    let isInteractive: Bool
    let isPressed: Bool?

    @Environment(\.meeshyGlassTone) private var hostTone
    @Environment(\.meeshyGlassIsPressed) private var styledPressed
    @Environment(\.meeshyGlassIsNested) private var isNested
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userReduceMotion
    #if DEBUG
    @Environment(\.meeshyGlassForcesDrawn) private var forcesDrawn
    @Environment(\.meeshyGlassForcesOpaque) private var forcesOpaque
    #endif
    @State private var isHovered = false

    /// Dessous iOS 26, le contenu reçoit `meeshyGlassIsNested` (une surface du
    /// kit posée dedans ne porte pas de seconde matière) et un appui remis à
    /// faux (l'appui de l'hôte ne descend pas dans ses voisins). Seuls
    /// `scaleEffect` et la recette du fond s'animent, jamais la mise en page.
    func body(content: Content) -> some View {
        let recipe = self.recipe
        if #available(iOS 26.0, *), recipe.material == .liquid {
            content.glassEffect(makeMeeshyGlass(tint: tint, interactive: isInteractive), in: shape)
        } else {
            content
                .environment(\.meeshyGlassIsPressed, false)
                .environment(\.meeshyGlassIsNested, true)
                .background(
                    MeeshyDrawnGlass(shape: shape, recipe: recipe, tint: tint)
                        .meeshyAnimation(MeeshyAnimation.springFast, value: isHovered)
                        .meeshyAnimation(.easeInOut(duration: MeeshyGlassRecipe.toneFadeDuration), value: resolvedTone)
                )
                .scaleEffect(recipe.scale)
                .meeshyAnimation(MeeshyAnimation.springFast, value: isPressedNow)
                .onHover { hovering in isHovered = isInteractive && hovering }
        }
    }

    private var resolvedTone: MeeshyGlassTone {
        tone ?? hostTone
    }

    private var isPressedNow: Bool {
        isInteractive && (isPressed ?? styledPressed)
    }

    private var recipe: MeeshyGlassRecipe {
        MeeshyGlassRecipe.resolve(
            tone: resolvedTone,
            density: density,
            isTinted: tint != nil,
            isInteractive: isInteractive,
            isPressed: isPressedNow,
            material: material,
            reduceMotion: MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userReduceMotion),
            isDark: colorScheme == .dark,
            isNested: isNested,
            isHovered: isHovered
        )
    }

    private var material: MeeshyGlassMaterial {
        MeeshyGlassMaterial.resolve(
            isLiquidAvailable: Platform.isIOS26OrLater,
            reduceTransparency: reduceTransparency,
            forcesDrawn: forcesDrawnInDebug,
            forcesOpaque: forcesOpaqueInDebug
        )
    }

    private var forcesOpaqueInDebug: Bool {
        #if DEBUG
        return forcesOpaque
        #else
        return false
        #endif
    }

    private var forcesDrawnInDebug: Bool {
        #if DEBUG
        return forcesDrawn || MeeshyGlassDebug.launchForcesDrawn
        #else
        return false
        #endif
    }
}
