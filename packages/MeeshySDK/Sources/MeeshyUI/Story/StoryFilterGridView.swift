import SwiftUI
import MeeshySDK

/// **Public depuis le lot 3A du composer unifié (#4035).** Déjà une vue
/// autonome — aucun rappel, aucune dépendance à la coquille plein écran
/// (`StoryComposerView` / `ComposerControlsLayer` / `ComposerBottomBand` /
/// `ComposerToolPanelHost`) — c'est ce qui en fait le candidat le plus sûr
/// pour le premier montage de `EmbeddedSceneInspector` (zone contextuelle
/// NEUVE de l'écran document). L'init explicite préserve le site d'appel
/// existant de `ComposerToolPanelHost.textPanel` (mêmes labels, même ordre) :
/// zéro régression sur l'atelier.
public struct StoryFilterGridView: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    var previewImage: UIImage?
    /// **L'objet dont la grille règle le filtre** (retour porteur 2026-09-28 :
    /// les réglages d'un objet ne touchent que lui). `nil` ⇒ le filtre de la
    /// SLIDE, porté par le fond ; un id ⇒ `StoryMediaObject.filter` de cet
    /// objet, sans curseur d'intensité (le filtre d'un objet est plein).
    var objectId: String?
    /// Appelé APRÈS chaque choix (#8792) — l'hôte y rejoue les transitions de
    /// la scène pour montrer le nouvel effet en situation.
    var onChoose: ((String?) -> Void)?

    public init(viewModel: StoryComposerViewModel, previewImage: UIImage? = nil, objectId: String? = nil,
                onChoose: ((String?) -> Void)? = nil) {
        self.viewModel = viewModel
        self.previewImage = previewImage
        self.objectId = objectId
        self.onChoose = onChoose
    }

    private var selectedRaw: String? {
        guard let objectId else { return viewModel.selectedFilter }
        return viewModel.mediaObjectFilter(id: objectId)
    }

    private func choose(_ raw: String?) {
        if let objectId {
            viewModel.applyMediaObjectFilter(id: objectId, raw)
        } else {
            viewModel.applyFilter(raw)
        }
        onChoose?(raw)
    }

    @Environment(\.colorScheme) private var colorScheme
    /// Les vignettes du fond COURANT (#8792), rendues hors du fil principal par
    /// `StoryFilterThumbnails` — vides tant qu'elles se calculent : la tuile
    /// montre alors son dégradé, jamais un sablier.
    @State private var tiles: [String: UIImage] = [:]

    public var body: some View {
        // Header interne + background ultraThinMaterial retires : le bandeau parent
        // (ComposerToolPanelHost) fournit deja le bouton retour "< Filtres" et le
        // background glass. Triple encapsulation visuelle eliminee.
        VStack(spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    // "Original" = no filter
                    filterThumbnail(filter: nil, label: "Original")
                    ForEach(StoryFilter.allCases, id: \.self) { filter in
                        filterThumbnail(filter: filter, label: filter.displayName)
                    }
                }
                .padding(.horizontal, 12)
            }

            if objectId == nil, viewModel.selectedFilter != nil {
                intensitySlider
            }
        }
        .task(id: thumbnailTaskKey) {
            await prepareThumbnailBase()
        }
    }

    @ViewBuilder
    private func filterThumbnail(filter: StoryFilter?, label: String) -> some View {
        let isSelected = selectedRaw == filter?.rawValue

        Button {
            choose(filter?.rawValue)
            HapticFeedback.light()
        } label: {
            VStack(spacing: 4) {
                Group {
                    if let tile = tiles[filter?.rawValue ?? StoryFilterThumbnails.originalKey] {
                        Image(uiImage: tile)
                            .resizable()
                            .scaledToFill()
                            .transition(.opacity)
                    } else {
                        fallbackGradient(for: filter)
                    }
                }
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(isSelected ? MeeshyColors.brandPrimary : Color.white.opacity(0.25), lineWidth: isSelected ? 2 : 1)
                )

                Text(label)
                    .font(.system(size: 10, weight: isSelected ? .bold : .regular))
                    .foregroundStyle(isSelected ? MeeshyColors.brandPrimary : (colorScheme == .dark ? .white.opacity(0.7) : MeeshyColors.indigo950.opacity(0.7)))
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    @ViewBuilder
    private func fallbackGradient(for filter: StoryFilter?) -> some View {
        let colors: [Color] = {
            guard let filter else {
                return [MeeshyColors.indigo500, MeeshyColors.indigo700]
            }
            switch filter {
            case .vintage:  return [Color(hex: "D4A574"), Color(hex: "8B7355")]
            case .bw:       return [Color.gray, Color(hex: "333333")]
            case .warm:     return [Color(hex: "FF8C42"), Color(hex: "FFD700")]
            case .cool:     return [Color(hex: "4FC3F7"), Color(hex: "0288D1")]
            case .dramatic: return [Color(hex: "1A1A2E"), Color(hex: "16213E")]
            case .vivid:    return [Color(hex: "FF6B6B"), Color(hex: "4ECDC4")]
            case .fade:     return [Color(hex: "C4C4C4"), Color(hex: "E8E8E8")]
            case .chrome:   return [Color(hex: "2C3E50"), Color(hex: "BDC3C7")]
            }
        }()
        LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private var intensitySlider: some View {
        let primaryTextColor: Color = colorScheme == .dark ? .white : MeeshyColors.indigo950
        return HStack(spacing: 12) {
            Text(String(localized: "story.filters.intensity", defaultValue: "Intensite", bundle: .module))
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(primaryTextColor.opacity(0.7))

            Slider(value: Binding(
                get: { viewModel.filterIntensity },
                set: { viewModel.updateFilterIntensity($0) }
            ), in: 0...1)
            .tint(MeeshyColors.brandPrimary)

            Text("\(Int(viewModel.filterIntensity * 100))%")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(primaryTextColor)
                .frame(width: 40)
        }
        .padding(.horizontal, 16)
    }

    private var thumbnailSourceKey: String? {
        previewImage.map { StoryFilterThumbnails.sourceKey(slideId: objectId ?? viewModel.currentSlide.id, image: $0) }
    }

    private var thumbnailTaskKey: String { thumbnailSourceKey ?? "" }

    private func prepareThumbnailBase() async {
        guard let source = previewImage, let key = thumbnailSourceKey else {
            tiles = [:]
            return
        }
        let rendered = await StoryFilterThumbnails.tiles(for: source, sourceKey: key)
        guard !Task.isCancelled else { return }
        withAnimation(.easeOut(duration: 0.2)) { tiles = rendered }
    }
}
