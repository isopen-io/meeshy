import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins
import MeeshySDK

struct StoryFilterGridView: View {
    @Bindable var viewModel: StoryComposerViewModel
    var previewImage: UIImage?

    var body: some View {
        VStack(spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    // "Original" = no filter
                    filterThumbnail(filter: nil, label: "Original")
                    ForEach(StoryFilter.allCases, id: \.self) { filter in
                        filterThumbnail(filter: filter, label: filter.displayName)
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

                Text(label)
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
