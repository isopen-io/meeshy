import SwiftUI

// MARK: - La pose dans l'hôte

/// Pose une feuille ancrée par-dessus son hôte : l'entrée et la sortie sont une translation
/// depuis le bas avec fondu, immédiates sous « Réduire les animations ». Le contenu n'est
/// monté que feuille ouverte.
private struct MeeshyAnchoredSheetPresenter<Sheet: View>: ViewModifier {
    private let isPresented: Bool
    private let sheet: () -> Sheet

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(isPresented: Bool, sheet: @escaping () -> Sheet) {
        self.isPresented = isPresented
        self.sheet = sheet
    }

    func body(content: Content) -> some View {
        content.overlay {
            ZStack {
                if isPresented {
                    sheet().transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(MeeshyAnchoredSheetMetrics.motion(reduceMotion: reduceMotion).animation, value: isPresented)
        }
    }
}

public extension View {
    /// Ancre une feuille en bas de cette vue tant que `isPresented` est vrai. `onDismiss` de la
    /// feuille repose `isPresented` à faux ; l'hôte lit sa place par `onMeeshyAnchoredSheetFootprint`.
    func meeshyAnchoredSheet<Trailing: View, Sheet: View>(
        isPresented: Binding<Bool>,
        title: String? = nil,
        accessibilityLabel: String? = nil,
        height: MeeshyAnchoredSheetHeight = .content,
        maximumFraction: CGFloat = MeeshyAnchoredSheetMetrics.maximumFraction,
        showsHandle: Bool = true,
        isDragDismissEnabled: Bool = true,
        closeLabel: String? = MeeshyAnchoredSheetCopy.close,
        surface: MeeshyAnchoredSheetSurface = .theme,
        outside: MeeshyAnchoredSheetOutside = .dismisses,
        scrim: Bool = false,
        maxWidth: CGFloat? = nil,
        @ViewBuilder trailing: @escaping () -> Trailing,
        @ViewBuilder content: @escaping () -> Sheet
    ) -> some View {
        modifier(MeeshyAnchoredSheetPresenter(isPresented: isPresented.wrappedValue) {
            MeeshyAnchoredSheet(
                title: title, accessibilityLabel: accessibilityLabel, height: height, maximumFraction: maximumFraction,
                showsHandle: showsHandle, isDragDismissEnabled: isDragDismissEnabled, closeLabel: closeLabel,
                surface: surface, outside: outside, scrim: scrim, maxWidth: maxWidth,
                onDismiss: { isPresented.wrappedValue = false },
                trailing: trailing, content: content
            )
        })
    }

    /// La même feuille, sans emplacement de fin d'en-tête.
    func meeshyAnchoredSheet<Sheet: View>(
        isPresented: Binding<Bool>,
        title: String? = nil,
        accessibilityLabel: String? = nil,
        height: MeeshyAnchoredSheetHeight = .content,
        maximumFraction: CGFloat = MeeshyAnchoredSheetMetrics.maximumFraction,
        showsHandle: Bool = true,
        isDragDismissEnabled: Bool = true,
        closeLabel: String? = MeeshyAnchoredSheetCopy.close,
        surface: MeeshyAnchoredSheetSurface = .theme,
        outside: MeeshyAnchoredSheetOutside = .dismisses,
        scrim: Bool = false,
        maxWidth: CGFloat? = nil,
        @ViewBuilder content: @escaping () -> Sheet
    ) -> some View {
        meeshyAnchoredSheet(
            isPresented: isPresented, title: title, accessibilityLabel: accessibilityLabel, height: height,
            maximumFraction: maximumFraction, showsHandle: showsHandle, isDragDismissEnabled: isDragDismissEnabled,
            closeLabel: closeLabel, surface: surface, outside: outside, scrim: scrim, maxWidth: maxWidth,
            trailing: { EmptyView() }, content: content
        )
    }

    /// Ancre la feuille de `item` tant qu'il n'est pas `nil` ; la fermeture le remet à `nil`.
    func meeshyAnchoredSheet<Item: Identifiable, Trailing: View, Sheet: View>(
        item: Binding<Item?>,
        title: String? = nil,
        accessibilityLabel: String? = nil,
        height: MeeshyAnchoredSheetHeight = .content,
        maximumFraction: CGFloat = MeeshyAnchoredSheetMetrics.maximumFraction,
        showsHandle: Bool = true,
        isDragDismissEnabled: Bool = true,
        closeLabel: String? = MeeshyAnchoredSheetCopy.close,
        surface: MeeshyAnchoredSheetSurface = .theme,
        outside: MeeshyAnchoredSheetOutside = .dismisses,
        scrim: Bool = false,
        maxWidth: CGFloat? = nil,
        @ViewBuilder trailing: @escaping (Item) -> Trailing,
        @ViewBuilder content: @escaping (Item) -> Sheet
    ) -> some View {
        modifier(MeeshyAnchoredSheetPresenter(isPresented: item.wrappedValue != nil) {
            presentedItemSheet(
                item: item, title: title, accessibilityLabel: accessibilityLabel, height: height,
                maximumFraction: maximumFraction, showsHandle: showsHandle, isDragDismissEnabled: isDragDismissEnabled,
                closeLabel: closeLabel, surface: surface, outside: outside, scrim: scrim, maxWidth: maxWidth,
                trailing: trailing, content: content
            )
        })
    }

    /// La même feuille par élément, sans emplacement de fin d'en-tête.
    func meeshyAnchoredSheet<Item: Identifiable, Sheet: View>(
        item: Binding<Item?>,
        title: String? = nil,
        accessibilityLabel: String? = nil,
        height: MeeshyAnchoredSheetHeight = .content,
        maximumFraction: CGFloat = MeeshyAnchoredSheetMetrics.maximumFraction,
        showsHandle: Bool = true,
        isDragDismissEnabled: Bool = true,
        closeLabel: String? = MeeshyAnchoredSheetCopy.close,
        surface: MeeshyAnchoredSheetSurface = .theme,
        outside: MeeshyAnchoredSheetOutside = .dismisses,
        scrim: Bool = false,
        maxWidth: CGFloat? = nil,
        @ViewBuilder content: @escaping (Item) -> Sheet
    ) -> some View {
        meeshyAnchoredSheet(
            item: item, title: title, accessibilityLabel: accessibilityLabel, height: height,
            maximumFraction: maximumFraction, showsHandle: showsHandle, isDragDismissEnabled: isDragDismissEnabled,
            closeLabel: closeLabel, surface: surface, outside: outside, scrim: scrim, maxWidth: maxWidth,
            trailing: { _ in EmptyView() }, content: content
        )
    }
}

/// La feuille d'un élément ; `EmptyView` tant qu'il est absent (la sortie rend la dernière image).
@ViewBuilder
private func presentedItemSheet<Item: Identifiable, Trailing: View, Sheet: View>(
    item: Binding<Item?>,
    title: String?,
    accessibilityLabel: String?,
    height: MeeshyAnchoredSheetHeight,
    maximumFraction: CGFloat,
    showsHandle: Bool,
    isDragDismissEnabled: Bool,
    closeLabel: String?,
    surface: MeeshyAnchoredSheetSurface,
    outside: MeeshyAnchoredSheetOutside,
    scrim: Bool,
    maxWidth: CGFloat?,
    trailing: @escaping (Item) -> Trailing,
    content: @escaping (Item) -> Sheet
) -> some View {
    if let value = item.wrappedValue {
        MeeshyAnchoredSheet(
            title: title, accessibilityLabel: accessibilityLabel, height: height, maximumFraction: maximumFraction,
            showsHandle: showsHandle, isDragDismissEnabled: isDragDismissEnabled, closeLabel: closeLabel,
            surface: surface, outside: outside, scrim: scrim, maxWidth: maxWidth,
            onDismiss: { item.wrappedValue = nil },
            trailing: { trailing(value) }, content: { content(value) }
        )
        .id(value.id)
    }
}

// MARK: - Les feuilles du système

/// **La place d'une feuille SYSTÈME de hauteur fixe**, publiée comme celle d'une feuille
/// ancrée : rien ne s'y dessine et rien ne s'y touche. L'hôte réduit son contenu au-dessus
/// d'elle sans que la feuille soit la sienne.
public struct MeeshyAnchoredSheetPlaceholder: View {
    private let height: MeeshyAnchoredSheetHeight
    private let maximumFraction: CGFloat

    public init(
        height: MeeshyAnchoredSheetHeight,
        maximumFraction: CGFloat = MeeshyAnchoredSheetMetrics.maximumFraction
    ) {
        self.height = height
        self.maximumFraction = maximumFraction
    }

    public var body: some View {
        GeometryReader { geo in
            Color.clear.preference(
                key: MeeshyAnchoredSheetFootprintKey.self,
                value: footprint(geo: geo)
            )
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func footprint(geo: GeometryProxy) -> MeeshyAnchoredSheetFootprint {
        let rest = MeeshyAnchoredSheetMetrics.height(
            height, content: 0, available: geo.size.height, maximumFraction: maximumFraction
        )
        return MeeshyAnchoredSheetFootprint(
            top: MeeshyAnchoredSheetMetrics.restingTop(containerMaxY: geo.frame(in: .global).maxY, height: rest),
            height: rest
        )
    }
}

/// La feuille système de hauteur fixe : un seul cran, sa poignée visible. `nil` : la feuille
/// garde ses crans par défaut.
private struct MeeshyFixedHeightSheet: ViewModifier {
    let fraction: CGFloat?

    @ViewBuilder
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

public extension View {
    /// À poser sur le contenu d'une feuille système : une hauteur fixe, la poignée visible.
    func meeshyFixedHeightSheet(fraction: CGFloat?) -> some View {
        modifier(MeeshyFixedHeightSheet(fraction: fraction))
    }
}
