import SwiftUI
import MeeshySDK

// MARK: - Simple Segment

struct SimpleSegment: Identifiable {
    let id: String
    let name: String
    let type: TrackType
    var startTime: Float
    var duration: Float
    var image: UIImage?
    var waveformSamples: [Float]?
    var sourceLanguage: String?
}

// MARK: - Simple Timeline View

struct SimpleTimelineView: View {
    @Bindable var viewModel: StoryComposerViewModel
    var onEditTap: ((String) -> Void)?

    @Environment(\.theme) private var theme
    @State private var segments: [SimpleSegment] = []

    private let pixelsPerSecond: CGFloat = 60
    private let segmentHeight: CGFloat = 48
    private let headerHeight: CGFloat = 36
    private let toolbarHeight: CGFloat = 44

    private var totalWidth: CGFloat {
        CGFloat(viewModel.currentSlideDuration) * pixelsPerSecond
    }

    var body: some View {
        VStack(spacing: 0) {
            headerBar
            Divider().overlay(theme.inputBorder.opacity(0.3))
            timelineRail
            if viewModel.selectedElementId != nil {
                miniToolbar
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(theme.backgroundPrimary.opacity(0.97))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(theme.inputBorder.opacity(0.4), lineWidth: 0.5)
                )
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: viewModel.selectedElementId)
        .onAppear { buildSegments() }
        .onChange(of: segmentFingerprint) { buildSegments() }
    }

    // MARK: - Fingerprint

    private var segmentFingerprint: Int {
        let e = viewModel.currentEffects
        var h = (e.textObjects?.count ?? 0)
        h = h &* 31 &+ (e.mediaObjects?.count ?? 0)
        h = h &* 31 &+ (e.audioPlayerObjects?.count ?? 0)
        for t in e.textObjects ?? [] { h = h &* 31 &+ t.id.hashValue }
        for m in e.mediaObjects ?? [] { h = h &* 31 &+ m.id.hashValue }
        for a in e.audioPlayerObjects ?? [] { h = h &* 31 &+ a.id.hashValue }
        return h
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack(spacing: 8) {
            Button {
                viewModel.isTimelinePlaying.toggle()
            } label: {
                Image(systemName: viewModel.isTimelinePlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(MeeshyColors.brandPrimary)
            }
            .buttonStyle(.plain)

            Text(formatTime(viewModel.timelinePlaybackTime))
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundStyle(theme.textPrimary)

            Text("/")
                .font(.system(size: 11))
                .foregroundStyle(theme.textMuted)

            Text(formatTime(viewModel.currentSlideDuration))
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundStyle(theme.textSecondary)

            Spacer()
        }
        .padding(.horizontal, 12)
        .frame(height: headerHeight)
    }

    // MARK: - Timeline Rail

    private var timelineRail: some View {
        ZStack(alignment: .leading) {
            ScrollView(.horizontal, showsIndicators: false) {
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(theme.backgroundSecondary)
                        .frame(width: max(totalWidth, 200), height: segmentHeight)

                    HStack(spacing: 2) {
                        ForEach(segments) { segment in
                            segmentView(segment)
                                .onTapGesture {
                                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                        viewModel.selectedElementId = segment.id
                                    }
                                }
                        }
                    }
                    .padding(.horizontal, 4)

                    progressIndicator
                }
                .frame(height: segmentHeight)
            }
        }
        .frame(height: segmentHeight)
    }

    // MARK: - Segment View

    private func segmentView(_ segment: SimpleSegment) -> some View {
        let width = max(30, CGFloat(segment.duration) * pixelsPerSecond)
        let isSelected = viewModel.selectedElementId == segment.id

        return ZStack(alignment: .topTrailing) {
            ZStack {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(segment.type.color.opacity(0.5))

                segmentContent(segment, width: width)

                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(
                        isSelected ? MeeshyColors.brandPrimary : theme.textPrimary.opacity(0.1),
                        lineWidth: isSelected ? 2 : 0.5
                    )
            }

            if let lang = segment.sourceLanguage {
                languageBadge(lang: lang, elementId: segment.id)
            }
        }
        .frame(width: width, height: segmentHeight - 8)
        .shadow(
            color: isSelected ? MeeshyColors.brandPrimary.opacity(0.3) : .clear,
            radius: isSelected ? 4 : 0,
            y: isSelected ? 1 : 0
        )
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    // MARK: - Language Badge

    private func languageBadge(lang: String, elementId: String) -> some View {
        Menu {
            ForEach(DetectedLanguage.supported) { language in
                Button {
                    viewModel.updateElementLanguage(elementId: elementId, language: language.code)
                } label: {
                    HStack {
                        Text("\(language.flag) \(language.name)")
                        if language.code == lang || language.id == lang {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            Text(lang.prefix(2).uppercased())
                .font(.system(size: 8, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .padding(.horizontal, 4)
                .padding(.vertical, 2)
                .background(Capsule().fill(MeeshyColors.brandPrimary.opacity(0.8)))
        }
        .offset(x: -2, y: 2)
    }

    // MARK: - Segment Content

    @ViewBuilder
    private func segmentContent(_ segment: SimpleSegment, width: CGFloat) -> some View {
        switch segment.type {
        case .fgImage, .bgImage:
            if let img = segment.image {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
                    .frame(width: width, height: segmentHeight - 8)
                    .clipped()
                    .opacity(0.7)
            } else {
                Label(segment.name, systemImage: segment.type.icon)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)
                    .padding(.horizontal, 4)
            }

        case .fgVideo, .bgVideo:
            HStack(spacing: 3) {
                Image(systemName: segment.type.icon)
                    .font(.system(size: 10, weight: .semibold))
                Text(segment.name)
                    .font(.system(size: 9, weight: .medium))
                    .lineLimit(1)
            }
            .foregroundStyle(theme.textPrimary)
            .padding(.horizontal, 4)

        case .fgAudio, .bgAudio:
            if let samples = segment.waveformSamples, !samples.isEmpty {
                waveformView(samples: samples)
            } else {
                HStack(spacing: 3) {
                    Image(systemName: segment.type.icon)
                        .font(.system(size: 10, weight: .semibold))
                    Text(segment.name)
                        .font(.system(size: 9, weight: .medium))
                        .lineLimit(1)
                }
                .foregroundStyle(theme.textPrimary)
                .padding(.horizontal, 4)
            }

        case .text:
            HStack(spacing: 3) {
                Image(systemName: segment.type.icon)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(theme.textMuted)
                Text(segment.name)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 4)

        case .drawing:
            HStack(spacing: 3) {
                Image(systemName: segment.type.icon)
                    .font(.system(size: 10, weight: .semibold))
                Text(segment.name)
                    .font(.system(size: 9, weight: .medium))
                    .lineLimit(1)
            }
            .foregroundStyle(theme.textPrimary)
            .padding(.horizontal, 4)
        }
    }

    // MARK: - Waveform

    private func waveformView(samples: [Float]) -> some View {
        Canvas { context, size in
            let count = samples.count
            guard count > 0 else { return }
            let stepW = size.width / CGFloat(count)
            let midY = size.height / 2

            var path = Path()
            for (i, sample) in samples.enumerated() {
                let x = CGFloat(i) * stepW + stepW / 2
                let amp = CGFloat(sample) * midY * 0.7
                path.move(to: CGPoint(x: x, y: midY - amp))
                path.addLine(to: CGPoint(x: x, y: midY + amp))
            }
            context.stroke(path, with: .color(theme.textSecondary), lineWidth: 1.5)
        }
        .allowsHitTesting(false)
    }

    // MARK: - Progress Indicator

    private var progressIndicator: some View {
        let progress = viewModel.currentSlideDuration > 0
            ? CGFloat(viewModel.timelinePlaybackTime / viewModel.currentSlideDuration)
            : 0
        let xPos = progress * totalWidth

        return Rectangle()
            .fill(MeeshyColors.brandPrimary)
            .frame(width: 2, height: segmentHeight)
            .offset(x: xPos)
            .allowsHitTesting(false)
            .animation(.linear(duration: 0.05), value: viewModel.timelinePlaybackTime)
    }

    // MARK: - Mini Toolbar

    @ViewBuilder
    private var miniToolbar: some View {
        if let selectedId = viewModel.selectedElementId,
           let segment = segments.first(where: { $0.id == selectedId }) {
            Divider().overlay(theme.inputBorder.opacity(0.3))

            HStack(spacing: 16) {
                Button {
                    onEditTap?(selectedId)
                } label: {
                    Image(systemName: "pencil.circle")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(MeeshyColors.brandPrimary)
                }
                .buttonStyle(.plain)

                Spacer()

                HStack(spacing: 6) {
                    Button {
                        adjustDuration(for: selectedId, delta: -0.5)
                    } label: {
                        Image(systemName: "minus.circle")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(theme.textSecondary)
                    }
                    .buttonStyle(.plain)

                    Text(String(format: "%.1fs", segment.duration))
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundStyle(theme.textPrimary)
                        .frame(minWidth: 40)

                    Button {
                        adjustDuration(for: selectedId, delta: 0.5)
                    } label: {
                        Image(systemName: "plus.circle")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(theme.textSecondary)
                    }
                    .buttonStyle(.plain)
                }

                Spacer()

                Button {
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                        viewModel.deleteElement(id: selectedId)
                        viewModel.selectedElementId = nil
                        buildSegments()
                    }
                } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(MeeshyColors.error)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .frame(height: toolbarHeight)
        }
    }

    // MARK: - Actions

    private func adjustDuration(for id: String, delta: Float) {
        var effects = viewModel.currentEffects

        if let idx = effects.textObjects?.firstIndex(where: { $0.id == id }) {
            let current = effects.textObjects?[idx].displayDuration ?? viewModel.currentSlideDuration
            let newDuration = max(0.5, current + delta)
            effects.textObjects?[idx].displayDuration = newDuration
            viewModel.currentEffects = effects
            viewModel.autoExtendDuration(forElementEnd: (effects.textObjects?[idx].startTime ?? 0) + newDuration)
        } else if let idx = effects.mediaObjects?.firstIndex(where: { $0.id == id }) {
            let current = effects.mediaObjects?[idx].duration ?? viewModel.currentSlideDuration
            let newDuration = max(0.5, current + delta)
            effects.mediaObjects?[idx].duration = newDuration
            viewModel.currentEffects = effects
            viewModel.autoExtendDuration(forElementEnd: (effects.mediaObjects?[idx].startTime ?? 0) + newDuration)
        } else if let idx = effects.audioPlayerObjects?.firstIndex(where: { $0.id == id }) {
            let current = effects.audioPlayerObjects?[idx].duration ?? viewModel.currentSlideDuration
            let newDuration = max(0.5, current + delta)
            effects.audioPlayerObjects?[idx].duration = newDuration
            viewModel.currentEffects = effects
            viewModel.autoExtendDuration(forElementEnd: (effects.audioPlayerObjects?[idx].startTime ?? 0) + newDuration)
        }

        buildSegments()
    }

    // MARK: - Build Segments

    private func buildSegments() {
        var result: [SimpleSegment] = []
        let effects = viewModel.currentEffects
        let slideDur = viewModel.currentSlideDuration

        for text in effects.textObjects ?? [] {
            let truncated = String(text.content.prefix(20))
            result.append(SimpleSegment(
                id: text.id,
                name: truncated,
                type: .text,
                startTime: text.startTime ?? 0,
                duration: text.displayDuration ?? slideDur,
                sourceLanguage: text.sourceLanguage
            ))
        }

        for media in effects.mediaObjects ?? [] {
            let trackType: TrackType
            if media.mediaType == "video" {
                trackType = media.placement == "background" ? .bgVideo : .fgVideo
            } else {
                trackType = media.placement == "background" ? .bgImage : .fgImage
            }

            let img = viewModel.loadedImages[media.id]
            result.append(SimpleSegment(
                id: media.id,
                name: media.mediaType == "video" ? "Video" : "Image",
                type: trackType,
                startTime: media.startTime ?? 0,
                duration: media.duration ?? slideDur,
                image: img,
                sourceLanguage: media.sourceLanguage
            ))
        }

        for audio in effects.audioPlayerObjects ?? [] {
            let trackType: TrackType = audio.placement == "background" ? .bgAudio : .fgAudio
            result.append(SimpleSegment(
                id: audio.id,
                name: "Audio",
                type: trackType,
                startTime: audio.startTime ?? 0,
                duration: audio.duration ?? slideDur,
                waveformSamples: audio.waveformSamples,
                sourceLanguage: audio.sourceLanguage
            ))
        }

        result.sort { $0.startTime < $1.startTime }
        segments = result
    }

    // MARK: - Helpers

    private func formatTime(_ seconds: Float) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}
