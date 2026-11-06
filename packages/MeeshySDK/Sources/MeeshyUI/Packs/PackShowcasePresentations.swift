import SwiftUI
import MeeshySDK

// MARK: - Où la fiche, l'éditeur et le plein écran se présentent (#16268, #16433)

/// **La navigation de toute vitrine** : la fiche d'un pack s'empile en feuille au-dessus de la
/// boutique (elle-même souvent une feuille) ; dans cette feuille, une pile — « Du même éditeur »,
/// la page de l'éditeur, un autre pack — et le plein écran au-dessus de la pile. Toucher une
/// couverture de la boutique ouvre directement le plein écran. Refermer rend l'écran d'en dessous
/// tel qu'il était, défilement compris : la boutique ne se reconstruit pas.
struct PackShowcasePresentations: ViewModifier {
    @ObservedObject var model: PackShowcaseModel
    let context: (PackDomain) -> PackShowcaseContext

    func body(content: Content) -> some View {
        content
            .sheet(item: $model.detail, onDismiss: { model.viewer = nil }) { target in
                PackDetailStack(model: model, root: target, context: context)
            }
            .fullScreenCover(item: shopViewerBinding) { target in
                PackElementViewer(model: model, context: context(target.domain)) { model.viewer = nil }
            }
    }

    /// Le plein écran ouvert depuis la couverture d'une rangée ; ouvert depuis la fiche, c'est elle qui le présente.
    private var shopViewerBinding: Binding<PackViewerTarget?> {
        Binding(get: { model.detail == nil ? model.viewer : nil },
                set: { if model.detail == nil { model.viewer = $0 } })
    }
}

extension View {
    func packShowcase(_ model: PackShowcaseModel, context: @escaping (PackDomain) -> PackShowcaseContext) -> some View {
        modifier(PackShowcasePresentations(model: model, context: context))
    }
}

/// Une page de la pile de la fiche.
enum PackShowcaseRoute: Hashable {
    case pack(PackDetailTarget)
    case publisher(PackPublisherRef)
}

/// **La pile de la fiche** : la fiche d'un pack à la racine, puis ce qu'on y ouvre.
struct PackDetailStack: View {
    @ObservedObject var model: PackShowcaseModel
    let root: PackDetailTarget
    let context: (PackDomain) -> PackShowcaseContext

    @State private var path: [PackShowcaseRoute] = []
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack(path: $path) {
            page(.pack(root))
                .navigationDestination(for: PackShowcaseRoute.self) { page($0) }
        }
        .fullScreenCover(item: viewerBinding) { target in
            PackElementViewer(model: model, context: context(target.domain)) { model.viewer = nil }
        }
    }

    private var viewerBinding: Binding<PackViewerTarget?> {
        Binding(get: { model.viewer }, set: { model.viewer = $0 })
    }

    @ViewBuilder
    private func page(_ route: PackShowcaseRoute) -> some View {
        Group {
            switch route {
            case .pack(let target):
                PackDetailView(model: model, target: target, context: context(target.domain)) { path.append($0) }
            case .publisher(let publisher):
                PublisherPageView(publisher: publisher, context: context) { path.append($0) }
            }
        }
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(String(localized: "shop.detail.done", defaultValue: "Terminé", bundle: .module)) { dismiss() }
            }
        }
    }
}

// MARK: - L'éditeur, en une ligne

/// « par Studio Lumière ✓ » — l'éditeur d'un pack, vérifié ou non (#16315).
struct PackPublisherLabel: View {
    let publisher: PackPublisherRef
    var size: CGFloat = 13

    var body: some View {
        HStack(spacing: 4) {
            Text(String(format: String(localized: "sticker.sheet.pack.by", defaultValue: "par %@", bundle: .module), publisher.name))
                .lineLimit(1)
            if publisher.verified {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(MeeshyColors.indigo500)
                    .accessibilityHidden(true)
            }
        }
        .font(MeeshyFont.relative(size, weight: .medium))
        .foregroundStyle(.secondary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.voiceOver(publisher))
    }

    static func voiceOver(_ publisher: PackPublisherRef) -> String {
        let by = String(format: String(localized: "sticker.sheet.pack.by", defaultValue: "par %@", bundle: .module), publisher.name)
        guard publisher.verified else { return by }
        return by + ", " + String(localized: "shop.publisher.verified", defaultValue: "éditeur vérifié", bundle: .module)
    }
}

// MARK: - Une vignette de pack, qui ouvre sa fiche

/// Un pack d'une rangée horizontale (« Du même éditeur ») ou d'une grille (le catalogue de l'éditeur).
struct PackCatalogueTile: View {
    let row: PackRow
    let open: () -> Void

    var body: some View {
        Button {
            HapticFeedback.light()
            open()
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                PackCoverView(cover: row.cover, side: 64)
                    .frame(width: 64, height: 64)
                Text(row.name)
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .frame(width: 84)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(row.name)
        .accessibilityHint(String(localized: "shop.row.open.hint", defaultValue: "Ouvre la fiche du pack", bundle: .module))
        .accessibilityIdentifier("shop.catalogue.\(row.slug)")
    }
}
