import SwiftUI
import MeeshySDK

struct StoryFilterGridView: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    var previewImage: UIImage?

    @Environment(\.colorScheme) private var colorScheme
    /// Tile-sized downsample of `previewImage`, computed once per slide so each
    /// tile's `StoryFilterProcessor.apply` runs on a small bitmap (cheap + cached).
    @State private var thumbnailBase: UIImage?

    var body: some View {
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

            if viewModel.selectedFilter != nil {
                intensitySlider
            }
        }
        .task(id: thumbnailTaskKey) {
            await prepareThumbnailBase()
        }
    }

    @ViewBuilder
    private func filterThumbnail(filter: StoryFilter?, label: String) -> some View {
        let isSelected = viewModel.selectedFilter == filter?.rawValue

        Button {
            viewModel.applyFilter(filter?.rawValue)
            HapticFeedback.light()
        } label: {
            VStack(spacing: 4) {
                Group {
                    if let base = thumbnailBase {
                        // Same recipe the canvas uses (full strength on tiles, à la
                        // Instagram) — cached by slide id + filter so this is computed
                        // once per slide. The intensity slider only drives the canvas.
                        Image(uiImage: StoryFilterProcessor.apply(filter, to: base,
                                                                  imageId: viewModel.currentSlide.id))
                            .resizable()
                            .scaledToFill()
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

    private var thumbnailTaskKey: String {
        "\(viewModel.currentSlide.id)_\(previewImage != nil)"
    }

    /// Downsamples `previewImage` to a tile-sized square once per slide so each
    /// tile's `StoryFilterProcessor.apply` runs on a small bitmap. Mirrors the
    /// proven `StoryFilterPicker.generateThumbnails` pattern (off-main downsample).
    private func prepareThumbnailBase() async {
        guard let source = previewImage else {
            thumbnailBase = nil
            return
        }
        let target = CGSize(width: 128, height: 128)
        let small = await Task.detached(priority: .userInitiated) {
            let renderer = UIGraphicsImageRenderer(size: target)
            return renderer.image { _ in source.draw(in: CGRect(origin: .zero, size: target)) }
        }.value
        thumbnailBase = small
    }
}
