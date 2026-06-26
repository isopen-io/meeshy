import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins
import MeeshySDK

// MARK: - Story Filter Picker

public struct StoryFilterPicker: View {
    @Binding public var selectedFilter: StoryFilter?
    private let previewImage: UIImage?

    @State private var thumbnails: [StoryFilter: UIImage] = [:]
    @Environment(\.colorScheme) private var colorScheme

    public init(selectedFilter: Binding<StoryFilter?>, previewImage: UIImage? = nil) {
        self._selectedFilter = selectedFilter
        self.previewImage = previewImage
    }

    public var body: some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: "camera.filters")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(MeeshyColors.brandGradient)
                Text(String(localized: "story.filter.pickerTitle", defaultValue: "Filtres", bundle: .module))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(colorScheme == .dark ? .white : MeeshyColors.indigo950)
                Spacer()
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    noFilterButton

                    ForEach(StoryFilter.allCases, id: \.self) { filter in
                        filterButton(filter)
                    }
                }
                .padding(.horizontal, 4)
            }
        }
        .padding(16)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
        .task(id: previewImage) {
            await generateThumbnails()
        }
    }

    // MARK: - Thumbnail generation

    private func generateThumbnails() async {
        guard let source = previewImage else {
            await MainActor.run { thumbnails = [:] }
            return
        }
        let small = await Task.detached(priority: .userInitiated) {
            downsample(source, to: CGSize(width: 112, height: 112))
        }.value

        var result: [StoryFilter: UIImage] = [:]
        for filter in StoryFilter.allCases {
            let filtered = await Task.detached(priority: .userInitiated) {
                StoryFilterProcessor.apply(filter, to: small)
            }.value
            result[filter] = filtered
        }
        await MainActor.run { thumbnails = result }
    }

    private nonisolated func downsample(_ image: UIImage, to size: CGSize) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    }

    // MARK: - Buttons

    private var noFilterButton: some View {
        Button {
            withAnimation(.spring(response: 0.25)) { selectedFilter = nil }
            HapticFeedback.light()
        } label: {
            VStack(spacing: 4) {
                thumbnailView(for: nil)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(selectedFilter == nil ? Color.white : Color.clear, lineWidth: 2)
                    )

                Text(String(localized: "story.filter.original", defaultValue: "Original", bundle: .module))
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
                thumbnailView(for: filter)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(isSelected ? Color.white : Color.clear, lineWidth: 2)
                    )

                Text(filter.displayName)
                    .font(.system(size: 10, weight: isSelected ? .bold : .medium))
                    .foregroundColor(.white.opacity(isSelected ? 1 : 0.6))
            }
        }
        .accessibilityLabel("Filtre \(filter.displayName)")
    }

    @ViewBuilder
    private func thumbnailView(for filter: StoryFilter?) -> some View {
        if let filter, let thumb = thumbnails[filter] {
            Image(uiImage: thumb)
                .resizable()
                .scaledToFill()
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        } else if filter == nil, let source = previewImage {
            Image(uiImage: source)
                .resizable()
                .scaledToFill()
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        } else {
            fallbackGradient(for: filter)
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
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
}

// MARK: - CIFilter Application

public nonisolated struct StoryFilterProcessor {
    private static let context = CIContext()
    nonisolated(unsafe) private static let cache: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.countLimit = 50
        c.totalCostLimit = 20 * 1024 * 1024
        return c
    }()

    /// Applies `filter` to `image` at `intensity` (0…1). This is the SINGLE
    /// source of truth for the story filter look — shared by the composer
    /// canvas (`StoryCanvasUIView.updateFilterLayer`), the filter grid tiles and
    /// the legacy picker — so what the tile previews is exactly what the canvas
    /// renders. Intensity blends the fully-filtered image back toward the
    /// original via a dissolve, so the slider behaves identically for all eight
    /// effects (default `1.0` = full effect, preserving prior callers).
    public static func apply(_ filter: StoryFilter?, to image: UIImage,
                             imageId: String? = nil, intensity: Float = 1.0) -> UIImage {
        guard let filter = filter, let ciImage = CIImage(image: image) else { return image }
        let clamped = max(0, min(1, intensity))

        // Cache lookup — use caller-provided imageId (slide ID) or fallback to dimensions.
        // Intensity is part of the key so a slider drag doesn't serve a stale look.
        let id = imageId ?? "\(Int(image.size.width))x\(Int(image.size.height))_\(image.cgImage?.bytesPerRow ?? 0)"
        let cacheKey = "\(id)_\(filter.rawValue)_\(Int((clamped * 100).rounded()))" as NSString
        if let cached = cache.object(forKey: cacheKey) { return cached }

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
        case .vivid:
            let f = CIFilter.colorControls()
            f.inputImage = ciImage
            f.saturation = 1.5
            output = f.outputImage
        case .fade:
            let f = CIFilter(name: "CIPhotoEffectFade")
            f?.setValue(ciImage, forKey: kCIInputImageKey)
            output = f?.outputImage
        case .chrome:
            let f = CIFilter(name: "CIPhotoEffectChrome")
            f?.setValue(ciImage, forKey: kCIInputImageKey)
            output = f?.outputImage
        }

        guard let fullyFiltered = output else { return image }
        // Blend the full effect back toward the original by `intensity` so the
        // slider is meaningful for every filter (including the fixed-recipe
        // PhotoEffect ones). `dissolveTransition.time` 0 = original, 1 = filtered.
        let finalImage: CIImage = {
            if clamped >= 0.999 { return fullyFiltered }
            let dissolve = CIFilter.dissolveTransition()
            dissolve.inputImage = ciImage
            dissolve.targetImage = fullyFiltered.cropped(to: ciImage.extent)
            dissolve.time = clamped
            return dissolve.outputImage ?? fullyFiltered
        }()
        guard let cgImage = context.createCGImage(finalImage, from: ciImage.extent) else {
            return image
        }
        let result = UIImage(cgImage: cgImage, scale: image.scale, orientation: image.imageOrientation)
        let pixelCost = Int(result.size.width * result.size.height * result.scale * result.scale) * 4
        cache.setObject(result, forKey: cacheKey, cost: pixelCost)
        return result
    }
}
