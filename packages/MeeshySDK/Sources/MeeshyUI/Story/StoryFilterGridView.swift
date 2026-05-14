import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins
import MeeshySDK

struct StoryFilterGridView: View {
    @Bindable var viewModel: StoryComposerViewModel
    var previewImage: UIImage?

    @Environment(\.colorScheme) private var colorScheme

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
                    if let image = previewImage {
                        Image(uiImage: applyFilter(to: image, storyFilter: filter))
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

    private func applyFilter(to image: UIImage, storyFilter: StoryFilter?) -> UIImage {
        guard let storyFilter, let ciImage = CIImage(image: image) else { return image }

        let context = CIContext()
        var outputImage: CIImage?
        let ciName = storyFilter.ciFilterName

        switch ciName {
        case "CIColorControls":
            let filter = CIFilter.colorControls()
            filter.inputImage = ciImage
            filter.saturation = Float(1.0 + 0.5 * viewModel.filterIntensity)
            outputImage = filter.outputImage

        case "CIPhotoEffectMono", "CIPhotoEffectTransfer", "CIPhotoEffectFade", "CIPhotoEffectChrome", "CIPhotoEffectProcess":
            guard let filter = CIFilter(name: ciName) else { return image }
            filter.setValue(ciImage, forKey: kCIInputImageKey)
            outputImage = filter.outputImage

        case "CITemperatureAndTint":
            let filter = CIFilter.temperatureAndTint()
            filter.inputImage = ciImage
            let shift = Float(viewModel.filterIntensity * 2000)
            let direction: CGFloat = storyFilter == .warm ? 1 : -1
            filter.neutral = CIVector(x: 6500 + direction * CGFloat(shift), y: 0)
            outputImage = filter.outputImage

        default:
            return image
        }

        guard let output = outputImage,
              let cgImage = context.createCGImage(output, from: ciImage.extent) else {
            return image
        }
        return UIImage(cgImage: cgImage)
    }
}
