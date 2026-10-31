import SwiftUI
import MeeshyUI

/// **Les mesures d'une feuille ancrée du compositeur** (#13839, L3).
///
/// La feuille ne couvre jamais la scène : elle prend une part BORNÉE de la
/// hauteur, et la scène se réduit au-dessus d'elle. Un glissé vers le bas la
/// ferme dès qu'il en parcourt le quart, ou qu'un geste vif l'aurait emmené
/// au-delà de sa moitié.
nonisolated enum ComposerAnchoredSheetMetrics {

    enum Size: CaseIterable, Sendable {
        case compact
        case regular
        case tall
    }

    static let maximumFraction: CGFloat = 0.62

    static func fraction(_ size: Size) -> CGFloat {
        switch size {
        case .compact: return 0.3
        case .regular: return 0.5
        case .tall: return maximumFraction
        }
    }

    static func height(_ size: Size, available: CGFloat) -> CGFloat {
        guard available.isFinite, available > 0 else { return 0 }
        return min(available * fraction(size), available)
    }

    static func dismisses(translation: CGFloat, predictedEnd: CGFloat, height: CGFloat) -> Bool {
        guard height > 0 else { return translation > 0 }
        return translation > height * 0.25 || predictedEnd > height * 0.5
    }

    static func dragOffset(_ translation: CGFloat) -> CGFloat { max(0, translation) }

    /// Le haut de la feuille AU REPOS, hors glissé : la scène ne se recadre
    /// pas à chaque image du doigt.
    static func restingTop(containerMaxY: CGFloat, height: CGFloat) -> CGFloat { containerMaxY - height }
}

/// Le HAUT de la feuille ouverte, en coordonnées globales : la scène s'y arrête.
struct ComposerAnchoredSheetTopKey: PreferenceKey {
    static let defaultValue: CGFloat? = nil
    static func reduce(value: inout CGFloat?, nextValue: () -> CGFloat?) {
        value = nextValue() ?? value
    }
}

private struct ComposerAnchoredSheetTopEnvironmentKey: EnvironmentKey {
    static let defaultValue: CGFloat? = nil
}

extension EnvironmentValues {
    /// Le haut de la feuille ancrée ouverte (global), `nil` sans feuille.
    var composerAnchoredSheetTop: CGFloat? {
        get { self[ComposerAnchoredSheetTopEnvironmentKey.self] }
        set { self[ComposerAnchoredSheetTopEnvironmentKey.self] = newValue }
    }
}

/// **La feuille propre au compositeur** : posée dans la pile du meuble, ancrée
/// en bas, sans voile, sombre, de hauteur mesurée et publiée. Ce n'est pas une
/// présentation système — celles-ci couvrent la scène et n'offrent pas de
/// détentes personnalisées sous iOS 16. Ses gestes sont donc recâblés ici :
/// glissé vers le bas, échappement VoiceOver, OK à droite.
struct ComposerAnchoredSheet<Content: View>: View {
    let title: String?
    let size: ComposerAnchoredSheetMetrics.Size
    let forcesDark: Bool
    let onClose: () -> Void
    @ViewBuilder let content: () -> Content

    @State private var drag: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            let hauteur = ComposerAnchoredSheetMetrics.height(size, available: geo.size.height)
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                sheet(height: hauteur)
            }
            .preference(key: ComposerAnchoredSheetTopKey.self,
                        value: ComposerAnchoredSheetMetrics.restingTop(containerMaxY: geo.frame(in: .global).maxY,
                                                                       height: hauteur))
        }
    }

    private func sheet(height: CGFloat) -> some View {
        VStack(spacing: 0) {
            grip(height: height)
            content()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(height: height)
        .background(alignment: .top) {
            UnevenRoundedSheetShape(radius: MeeshyRadius.xlPlus)
                .fill(MeeshyColors.indigo950)
                .ignoresSafeArea(.container, edges: .bottom)
        }
        .environment(\.meeshySheetClose, onClose)
        .modifier(ComposerSheetScheme(forcesDark: forcesDark))
        .offset(y: drag)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape) { onClose() }
    }

    private func grip(height: CGFloat) -> some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(Color.white.opacity(0.35))
                .frame(width: 36, height: 5)
                .padding(.top, MeeshySpacing.sm)
                .accessibilityHidden(true)
            if let title { header(title) }
        }
        .frame(maxWidth: .infinity, minHeight: 22)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 4, coordinateSpace: .global)
                .onChanged { drag = ComposerAnchoredSheetMetrics.dragOffset($0.translation.height) }
                .onEnded { valeur in
                    let ferme = ComposerAnchoredSheetMetrics.dismisses(
                        translation: valeur.translation.height,
                        predictedEnd: valeur.predictedEndTranslation.height,
                        height: height)
                    if ferme { onClose() }
                    withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.9)) { drag = 0 }
                }
        )
    }

    private func header(_ title: String) -> some View {
        ZStack {
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)
            HStack {
                Spacer()
                Button(action: onClose) {
                    Text(ComposerAnchoredSheetCopy.ok)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundStyle(MeeshyColors.brandPrimary)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.defaultAction)
                .accessibilityIdentifier("composer.sheet.ok")
            }
        }
        .padding(.horizontal, MeeshySpacing.sm)
    }
}

/// Le thème sombre de la feuille, sans `preferredColorScheme` : posé dans la
/// pile, celui-ci remonterait jusqu'à la fenêtre et assombrirait tout le reste.
/// La place qu'occupe une feuille SYSTÈME de hauteur fixe, publiée comme celle
/// d'une feuille ancrée : rien ne s'y dessine et rien ne s'y touche.
struct ComposerAnchoredSheetFootprint: View {
    let size: ComposerAnchoredSheetMetrics.Size

    var body: some View {
        GeometryReader { geo in
            Color.clear
                .preference(key: ComposerAnchoredSheetTopKey.self,
                            value: ComposerAnchoredSheetMetrics.restingTop(
                                containerMaxY: geo.frame(in: .global).maxY,
                                height: ComposerAnchoredSheetMetrics.height(size, available: geo.size.height)))
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// La feuille système de hauteur fixe : un seul cran, sa poignée visible.
struct ComposerFixedHeightSheet: ViewModifier {
    let fraction: CGFloat?

    func body(content: Content) -> some View {
        if let fraction {
            content
                .presentationDetents([.fraction(fraction)])
                .presentationDragIndicator(.visible)
        } else {
            content
        }
    }
}

private struct ComposerSheetScheme: ViewModifier {
    let forcesDark: Bool
    func body(content: Content) -> some View {
        if forcesDark {
            content.environment(\.colorScheme, .dark)
        } else {
            content
        }
    }
}

/// Le haut arrondi, le bas droit : la feuille sort du bord de l'écran.
nonisolated private struct UnevenRoundedSheetShape: Shape {
    let radius: CGFloat
    func path(in rect: CGRect) -> Path {
        let r = min(radius, rect.width / 2, rect.height / 2)
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
        p.addArc(center: CGPoint(x: rect.minX + r, y: rect.minY + r), radius: r,
                 startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        p.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
        p.addArc(center: CGPoint(x: rect.maxX - r, y: rect.minY + r), radius: r,
                 startAngle: .degrees(270), endAngle: .degrees(0), clockwise: false)
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

nonisolated enum ComposerAnchoredSheetCopy {
    static var ok: String { String(localized: "common.ok", defaultValue: "OK", bundle: .main) }
    static var stickers: String {
        String(localized: "composer.sheet.stickers", defaultValue: "Stickers", bundle: .main)
    }
    static var audience: String { ComposerAudienceCopy.title }
    static var background: String {
        String(localized: "composer.sheet.background", defaultValue: "Fond", bundle: .main)
    }
    static var duration: String {
        String(localized: "composer.sheet.duration", defaultValue: "Durée de la diapo", bundle: .main)
    }
}
