import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins
import MeeshySDK

// MARK: - Story Filter Picker

public struct StoryFilterPicker: View {
    @Binding public var selectedFilter: StoryFilter?

    public init(selectedFilter: Binding<StoryFilter?>) {
        self._selectedFilter = selectedFilter
    }

    public var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                noFilterButton

                ForEach(StoryFilter.allCases, id: \.self) { filter in
                    filterButton(filter)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private var noFilterButton: some View {
        Button {
            withAnimation(.spring(response: 0.25)) { selectedFilter = nil }
            HapticFeedback.light()
        } label: {
            VStack(spacing: 4) {
                RoundedRectangle(cornerRadius: 10)
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: "FF2E63"), Color(hex: "08D9D6")],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 56, height: 56)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(selectedFilter == nil ? Color.white : Color.clear, lineWidth: 2)
                    )

                Text("None")
                    .font(.system(size: 10, weight: selectedFilter == nil ? .bold : .medium))
                    .foregroundColor(.white.opacity(selectedFilter == nil ? 1 : 0.6))
            }
        }
    }

    private func filterButton(_ filter: StoryFilter) -> some View {
        let isSelected = selectedFilter == filter
        return Button {
            withAnimation(.spring(response: 0.25)) { selectedFilter = filter }
            HapticFeedback.light()
        } label: {
            VStack(spacing: 4) {
                filterPreview(filter)
                    .frame(width: 56, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(isSelected ? Color.white : Color.clear, lineWidth: 2)
                    )

                Text(filter.displayName)
                    .font(.system(size: 10, weight: isSelected ? .bold : .medium))
                    .foregroundColor(.white.opacity(isSelected ? 1 : 0.6))
            }
        }
        .accessibilityLabel("Filter \(filter.displayName)")
    }

    @ViewBuilder
    private func filterPreview(_ filter: StoryFilter) -> some View {
        let colors: [Color] = {
            switch filter {
            case .vintage: return [Color(hex: "D4A574"), Color(hex: "8B7355")]
            case .bw: return [Color.gray, Color(hex: "333333")]
            case .warm: return [Color(hex: "FF8C42"), Color(hex: "FFD700")]
            case .cool: return [Color(hex: "4FC3F7"), Color(hex: "0288D1")]
            case .dramatic: return [Color(hex: "1A1A2E"), Color(hex: "16213E")]
            }
        }()
        LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

// MARK: - CIFilter Application

public struct StoryFilterProcessor {
    private static let context = CIContext()

    public static func apply(_ filter: StoryFilter?, to image: UIImage) -> UIImage {
        guard let filter = filter, let ciImage = CIImage(image: image) else { return image }

        let output: CIImage?
        switch filter {
        case .vintage:
            let f = CIFilter(name: "CIPhotoEffectTransfer")
            f?.setValue(ciImage, forKey: kCIInputImageKey)
            output = f?.outputImage
        case .bw:
            let f = CIFilter(name: "CIPhotoEffectNoir")
            f?.setValue(ciImage, forKey: kCIInputImageKey)
            output = f?.outputImage
        case .warm:
            let f = CIFilter(name: "CITemperatureAndTint")
            f?.setValue(ciImage, forKey: kCIInputImageKey)
            f?.setValue(CIVector(x: 6500 + 1000, y: 0), forKey: "inputNeutral")
            output = f?.outputImage
        case .cool:
            let f = CIFilter(name: "CITemperatureAndTint")
            f?.setValue(ciImage, forKey: kCIInputImageKey)
            f?.setValue(CIVector(x: 6500 - 1500, y: 0), forKey: "inputNeutral")
            output = f?.outputImage
        case .dramatic:
            let f = CIFilter(name: "CIPhotoEffectProcess")
            f?.setValue(ciImage, forKey: kCIInputImageKey)
            output = f?.outputImage
        }

        guard let outputImage = output,
              let cgImage = context.createCGImage(outputImage, from: outputImage.extent) else {
            return image
        }
        return UIImage(cgImage: cgImage, scale: image.scale, orientation: image.imageOrientation)
    }
}
