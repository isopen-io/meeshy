//
//  CameraEffectsOverlay.swift
//  Meeshy
//
//  Retractable overlay panels for selecting visual filters and audio effects
//  in CameraView during photo/video capture.
//
//  iOS 16+
//

import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins

// MARK: - Camera Effects Overlay

struct CameraEffectsOverlay: View {
    @Binding var selectedFilter: VideoFilter
    @Binding var selectedAudioEffect: AudioEffectType
    @Binding var showFilterPanel: Bool
    @Binding var showAudioEffectPanel: Bool
    let captureMode: CaptureMode
    let thumbnail: UIImage?

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Filter Panel (retractable)
            if showFilterPanel {
                filterPanel
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Audio Effect Panel (retractable, only for video mode)
            if showAudioEffectPanel && captureMode == .video {
                audioEffectPanel
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Toggle buttons bar
            toggleButtonsBar
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showFilterPanel)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showAudioEffectPanel)
    }

    // MARK: - Toggle Buttons Bar

    private var toggleButtonsBar: some View {
        HStack {
            // Filter toggle button
            Button {
                withAnimation {
                    showFilterPanel.toggle()
                    if showFilterPanel {
                        showAudioEffectPanel = false
                    }
                }
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "camera.filters")
                        .font(.system(size: 18))
                    if selectedFilter != .original {
                        Text(selectedFilter.rawValue)
                            .font(.system(size: 12, weight: .medium))
                    }
                }
                .foregroundColor(showFilterPanel || selectedFilter != .original ? .yellow : .white)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    Capsule()
                        .fill(Color.white.opacity(showFilterPanel ? 0.25 : 0.15))
                )
            }

            Spacer()

            // Audio effect toggle button (only for video mode)
            if captureMode == .video {
                Button {
                    withAnimation {
                        showAudioEffectPanel.toggle()
                        if showAudioEffectPanel {
                            showFilterPanel = false
                        }
                    }
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "waveform")
                            .font(.system(size: 18))
                        if selectedAudioEffect != .normal {
                            Text(audioEffectDisplayName)
                                .font(.system(size: 12, weight: .medium))
                        }
                    }
                    .foregroundColor(showAudioEffectPanel || selectedAudioEffect != .normal ? .yellow : .white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        Capsule()
                            .fill(Color.white.opacity(showAudioEffectPanel ? 0.25 : 0.15))
                    )
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
    }

    private var audioEffectDisplayName: String {
        switch selectedAudioEffect {
        case .normal: return "Normal"
        case .echo: return "Echo"
        case .reverb: return "Reverb"
        case .robot: return "Robot"
        case .chipmunk: return "Chipmunk"
        case .deep: return "Grave"
        case .telephone: return "Telephone"
        case .stadium: return "Stadium"
        default: return selectedAudioEffect.rawValue.capitalized
        }
    }

    // MARK: - Filter Panel

    private var filterPanel: some View {
        VStack(spacing: 8) {
            // Header
            HStack {
                Text("Filtres")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)

                Spacer()

                Button {
                    withAnimation {
                        showFilterPanel = false
                    }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.white.opacity(0.6))
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)

            // Filter thumbnails - Horizontal only (no vertical movement)
            HorizontalOnlyScrollView(height: 90) {
                HStack(spacing: 12) {
                    ForEach(VideoFilter.allCases, id: \.self) { filter in
                        CameraFilterThumbnail(
                            filter: filter,
                            thumbnail: thumbnail,
                            isSelected: selectedFilter == filter
                        ) {
                            selectedFilter = filter
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 12)
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.black.opacity(0.7))
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 16))
        )
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    // MARK: - Audio Effect Panel

    private var audioEffectPanel: some View {
        VStack(spacing: 8) {
            // Header
            HStack {
                Text("Effets audio")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)

                Spacer()

                Button {
                    withAnimation {
                        showAudioEffectPanel = false
                    }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.white.opacity(0.6))
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)

            // Audio effect buttons - Horizontal only (no vertical movement)
            HorizontalOnlyScrollView(height: 85) {
                HStack(spacing: 12) {
                    ForEach(commonAudioEffects, id: \.self) { effect in
                        AudioEffectThumbnail(
                            effect: effect,
                            isSelected: selectedAudioEffect == effect
                        ) {
                            selectedAudioEffect = effect
                            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 12)
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.black.opacity(0.7))
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 16))
        )
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    // Common audio effects for quick access
    private var commonAudioEffects: [AudioEffectType] {
        [.normal, .echo, .reverb, .robot, .chipmunk, .deep, .telephone, .stadium]
    }
}

// MARK: - Camera Filter Thumbnail

struct CameraFilterThumbnail: View {
    let filter: VideoFilter
    let thumbnail: UIImage?
    let isSelected: Bool
    let action: () -> Void

    @State private var filteredImage: UIImage?

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    if let image = filteredImage ?? thumbnail {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 60, height: 60)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    } else {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(filterPreviewColor)
                            .frame(width: 60, height: 60)
                    }

                    if isSelected {
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.yellow, lineWidth: 3)
                            .frame(width: 60, height: 60)
                    }
                }

                Text(filter.rawValue)
                    .font(.system(size: 10, weight: isSelected ? .semibold : .regular))
                    .foregroundColor(isSelected ? .yellow : .white)
                    .lineLimit(1)
            }
        }
        .task {
            await generateFilteredThumbnail()
        }
    }

    private var filterPreviewColor: Color {
        switch filter {
        case .original: return .gray.opacity(0.5)
        case .vivid: return .orange.opacity(0.6)
        case .mono: return .gray
        case .noir: return .black.opacity(0.8)
        case .fade: return .white.opacity(0.5)
        case .chrome: return .cyan.opacity(0.5)
        case .instant: return .yellow.opacity(0.5)
        case .process: return .purple.opacity(0.5)
        }
    }

    private func generateFilteredThumbnail() async {
        guard let thumbnail = thumbnail,
              filter != .original,
              let filterName = filter.ciFilterName else {
            return
        }

        guard let ciImage = CIImage(image: thumbnail),
              let ciFilter = CIFilter(name: filterName) else {
            return
        }

        ciFilter.setValue(ciImage, forKey: kCIInputImageKey)

        if filter == .vivid {
            ciFilter.setValue(0.5, forKey: "inputAmount")
        }

        guard let output = ciFilter.outputImage else { return }

        let context = CIContext(options: [.useSoftwareRenderer: false])
        guard let cgImage = context.createCGImage(output, from: output.extent) else { return }

        await MainActor.run {
            filteredImage = UIImage(cgImage: cgImage)
        }
    }
}

// MARK: - Audio Effect Thumbnail

struct AudioEffectThumbnail: View {
    let effect: AudioEffectType
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    Circle()
                        .fill(isSelected ? effectColor.opacity(0.8) : Color.white.opacity(0.15))
                        .frame(width: 56, height: 56)

                    Image(systemName: effectIcon)
                        .font(.system(size: 22))
                        .foregroundColor(isSelected ? .white : effectColor)

                    if isSelected {
                        Circle()
                            .stroke(Color.yellow, lineWidth: 3)
                            .frame(width: 56, height: 56)
                    }
                }

                Text(effectDisplayName)
                    .font(.system(size: 10, weight: isSelected ? .semibold : .regular))
                    .foregroundColor(isSelected ? .yellow : .white)
                    .lineLimit(1)
            }
        }
    }

    private var effectDisplayName: String {
        switch effect {
        case .normal: return "Normal"
        case .echo: return "Echo"
        case .reverb: return "Reverb"
        case .robot: return "Robot"
        case .chipmunk: return "Chipmunk"
        case .deep: return "Grave"
        case .telephone: return "Tel"
        case .stadium: return "Stadium"
        default: return effect.rawValue.prefix(6).capitalized
        }
    }

    private var effectIcon: String {
        switch effect {
        case .normal: return "waveform"
        case .echo: return "repeat"
        case .reverb: return "waveform.path"
        case .robot: return "cpu"
        case .chipmunk: return "hare"
        case .deep: return "waveform.badge.minus"
        case .telephone: return "phone"
        case .stadium: return "building.2"
        default: return "waveform"
        }
    }

    private var effectColor: Color {
        switch effect {
        case .normal: return .gray
        case .echo: return .blue
        case .reverb: return .purple
        case .robot: return .orange
        case .chipmunk: return .pink
        case .deep: return .indigo
        case .telephone: return .green
        case .stadium: return .cyan
        default: return .gray
        }
    }
}

// MARK: - Preview

#if DEBUG
struct CameraEffectsOverlay_Previews: PreviewProvider {
    static var previews: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            CameraEffectsOverlay(
                selectedFilter: .constant(.vivid),
                selectedAudioEffect: .constant(.echo),
                showFilterPanel: .constant(true),
                showAudioEffectPanel: .constant(false),
                captureMode: .video,
                thumbnail: nil
            )
        }
    }
}
#endif
