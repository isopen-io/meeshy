import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins
import MeeshySDK

struct StoryFilterGridView: View {
    @Bindable var viewModel: StoryComposerViewModel
    var previewImage: UIImage?

    private static let filters: [(name: String, ciName: String?)] = [
        ("Original", nil),
        ("Vivid", "CIColorControls"),
        ("N&B", "CIPhotoEffectMono"),
        ("Chaud", "CITemperatureAndTint"),
        ("Froid", "CITemperatureAndTint"),
        ("Vintage", "CIPhotoEffectTransfer"),
        ("Fade", "CIPhotoEffectFade"),
        ("Chrome", "CIPhotoEffectChrome"),
    ]

    var body: some View {
        VStack(spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Self.filters, id: \.name) { filter in
                        filterThumbnail(filter)
                    }
                }
                .padding(.horizontal, 16)
            }

            if viewModel.selectedFilter != nil {
                intensitySlider
            }
        }
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private func filterThumbnail(_ filter: (name: String, ciName: String?)) -> some View {
        let isSelected = viewModel.selectedFilter == filter.ciName

        Button {
            viewModel.applyFilter(filter.ciName)
            HapticFeedback.light()
        } label: {
            VStack(spacing: 4) {
                Group {
                    if let image = previewImage {
                        Image(uiImage: applyFilter(to: image, filterName: filter.ciName, filterDisplayName: filter.name))
                            .resizable()
                            .scaledToFill()
                    } else {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color(hex: viewModel.backgroundColor.replacingOccurrences(of: "#", with: "")))
                    }
                }
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(isSelected ? MeeshyColors.brandPrimary : Color.clear, lineWidth: 2)
                )

                Text(filter.name)
                    .font(.system(size: 10, weight: isSelected ? .bold : .regular))
                    .foregroundStyle(isSelected ? MeeshyColors.brandPrimary : .white.opacity(0.7))
            }
        }
        .buttonStyle(.plain)
    }

    private var intensitySlider: some View {
        HStack(spacing: 12) {
            Text(String(localized: "story.filters.intensity", defaultValue: "Intensite", bundle: .module))
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.6))

            Slider(value: Binding(
                get: { viewModel.filterIntensity },
                set: { viewModel.updateFilterIntensity($0) }
            ), in: 0...1)
            .tint(MeeshyColors.brandPrimary)

            Text("\(Int(viewModel.filterIntensity * 100))%")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(.white)
                .frame(width: 40)
        }
        .padding(.horizontal, 16)
    }

    private func applyFilter(to image: UIImage, filterName: String?, filterDisplayName: String) -> UIImage {
        guard let filterName, let ciImage = CIImage(image: image) else { return image }

        let context = CIContext()
        var outputImage: CIImage?

        switch filterName {
        case "CIColorControls":
            let filter = CIFilter.colorControls()
            filter.inputImage = ciImage
            filter.saturation = Float(1.0 + 0.5 * viewModel.filterIntensity)
            outputImage = filter.outputImage

        case "CIPhotoEffectMono", "CIPhotoEffectTransfer", "CIPhotoEffectFade", "CIPhotoEffectChrome":
            guard let filter = CIFilter(name: filterName) else { return image }
            filter.setValue(ciImage, forKey: kCIInputImageKey)
            outputImage = filter.outputImage

        case "CITemperatureAndTint":
            let filter = CIFilter.temperatureAndTint()
            filter.inputImage = ciImage
            let shift = Float(viewModel.filterIntensity * 2000)
            filter.neutral = CIVector(x: 6500 + (filterDisplayName == "Chaud" ? CGFloat(shift) : CGFloat(-shift)), y: 0)
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
