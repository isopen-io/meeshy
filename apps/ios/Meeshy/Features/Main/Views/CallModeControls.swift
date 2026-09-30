import SwiftUI
import UIKit
import MeeshyUI

struct CallEffectsModeControls: View {
    @ObservedObject var callManager: CallManager
    @ObservedObject var capture: CallCaptureController
    let subjects: [CallCaptureSubject]
    let tracks: [String: Any]
    let onExit: () -> Void

    @State private var config = VideoFilterConfig()
    @State private var original = VideoFilterConfig()
    @State private var category: CallEffectsCategory = .face
    @State private var showsSettings = false
    @AppStorage(CallModeCopy.gestureHintSeenKey) private var hasSeenGestureHint = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: MeeshySpacing.mdPlus) {
            if showsSettings {
                settingsRow
                    .transition(.opacity)
            } else {
                categoryPicker
                carousel
                    .transition(.opacity)
            }
            CallModeActionBar(
                exitHint: CallModeCopy.quitEffectsHint,
                onExit: { finish(validated: false) },
                options: [
                    CallModeOption(
                        id: "settings",
                        symbol: "slider.horizontal.3",
                        label: CallModeCopy.settings,
                        caption: CallModeCopy.settings,
                        hint: CallModeCopy.settingsHint,
                        isOn: showsSettings
                    ) {
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { showsSettings.toggle() }
                        HapticFeedback.light()
                    },
                    CallModeOption(
                        id: "validate",
                        symbol: "checkmark",
                        label: CallModeCopy.validate,
                        caption: CallModeCopy.validate,
                        hint: CallModeCopy.validateHint
                    ) {
                        finish(validated: true)
                    }
                ]
            )
        }
        .onAppear {
            original = callManager.videoFilters.config
            config = original
        }
        .task(id: CallCaptureSourceKey(subjects: subjects, tracks: tracks)) {
            capture.update(subjects: subjects, tracks: tracks)
        }
        .onDisappear {
            hasSeenGestureHint = true
            capture.stop()
        }
        .adaptiveOnChange(of: config) { _, newConfig in
            callManager.videoFilters.config = newConfig
        }
    }

    private func finish(validated: Bool) {
        let kept = CallEffectsModeRule.exiting(validated: validated, current: config, original: original)
        callManager.videoFilters.config = kept
        if validated { HapticFeedback.success() }
        onExit()
    }

    private var categoryPicker: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            ForEach(CallEffectsCategory.allCases, id: \.self) { item in
                if item != CallEffectsCategory.allCases.first {
                    Text(verbatim: "·")
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.white.opacity(MeeshyOpacity.strong))
                        .accessibilityHidden(true)
                }
                Button {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { category = item }
                    HapticFeedback.light()
                } label: {
                    Text(CallModeCopy.categoryName(item))
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.white.opacity(category == item ? 1 : 0.55))
                        .padding(.horizontal, MeeshySpacing.sm)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(category == item ? [.isButton, .isSelected] : [.isButton])
            }
        }
        .shadow(color: .black.opacity(MeeshyOpacity.strong), radius: 3)
    }

    @ViewBuilder
    private var carousel: some View {
        switch category {
        case .face:
            CallModeCarousel(
                items: CallEffectsModeRule.faces,
                selection: faceBinding,
                title: CallModeCopy.categoryName(.face),
                name: CallEffectsCopy.name,
                isRecording: capture.isRecording,
                hint: gestureHint,
                onCapturePhoto: shootMyImage,
                onStartRecording: filmMyImage
            ) { effect, isSelected in
                CallModeGlyph(art: CallEffectsCopy.art(effect), isSelected: isSelected)
            }
        case .color:
            CallModeCarousel(
                items: CallEffectsModeRule.colors,
                selection: colorBinding,
                title: CallModeCopy.categoryName(.color),
                name: CallEffectsCopy.presetName,
                isRecording: capture.isRecording,
                hint: gestureHint,
                onCapturePhoto: shootMyImage,
                onStartRecording: filmMyImage
            ) { preset, isSelected in
                CallModeGlyph(art: .symbol(CallEffectsCopy.presetSymbol(preset)), isSelected: isSelected)
            }
        }
    }

    private var gestureHint: String? {
        CallModeGestureRule.showsHint(hasSeenHint: hasSeenGestureHint, isRecording: capture.isRecording) ? CallModeCopy.gestureHint : nil
    }

    /// #8625 — en mode Effets, la photo et le film portent MON image seule,
    /// telle que l'effet la rend.
    private func shootMyImage() {
        hasSeenGestureHint = true
        Task { await capture.capture(style: .screen) }
    }

    private func filmMyImage() {
        hasSeenGestureHint = true
        Task { await capture.startRecording(style: .screen) }
    }

    private var faceBinding: Binding<CallFaceEffect> {
        Binding(
            get: { config.activeFaceEffect },
            set: { config = config.selectingFaceEffect($0) }
        )
    }

    private var colorBinding: Binding<VideoFilterPreset> {
        Binding(
            get: { CallEffectsModeRule.colorSelection(of: config) },
            set: { config = CallEffectsModeRule.applying(color: $0, to: config) }
        )
    }

    private var brightnessBinding: Binding<Double> {
        Binding(
            get: { Double(config.brightness) },
            set: { config = config.withBrightness(Float($0)) }
        )
    }

    private var settingsRow: some View {
        let limit = Double(VideoFilterConfig.brightnessLimit)
        let percent = LocalizedNumber.percent(Int((Double(config.brightness) / limit * 100).rounded()))
        return HStack(spacing: MeeshySpacing.mdPlus) {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "sun.min")
                    .font(.footnote)
                    .foregroundColor(MeeshyColors.mediaChromeSecondary)
                    .accessibilityHidden(true)
                Slider(value: brightnessBinding, in: -limit ... limit)
                    .tint(.white)
                    .accessibilityLabel(CallEffectsCopy.brightness)
                    .accessibilityValue(percent)
                Image(systemName: "sun.max")
                    .font(.footnote)
                    .foregroundColor(MeeshyColors.mediaChromeSecondary)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 44)
            CallPillChip(
                art: .symbol("person.and.background.dotted"),
                caption: CallEffectsCopy.blur,
                label: CallEffectsCopy.blur,
                isSelected: config.backgroundBlurEnabled
            ) {
                config = config.withBackgroundBlur(!config.backgroundBlurEnabled)
                HapticFeedback.light()
            }
        }
        .padding(.horizontal, MeeshySpacing.xxl)
    }
}

struct CallMontageModeControls: View {
    @ObservedObject var capture: CallCaptureController
    let subjects: [CallCaptureSubject]
    let tracks: [String: Any]
    /// #8743 — la conversation de l'appel, pour le nom du groupe et l'accent d'un cadre.
    let call: CallFrameCallContext
    var textsProvider: any CallFrameTextsProviding = CallFrameTextsResolver.shared
    let onExit: () -> Void

    @AppStorage(CallModeCopy.gestureHintSeenKey) private var hasSeenGestureHint = false

    private static let thumbnailSize = CGSize(width: 48, height: 85)

    var body: some View {
        let people = subjects.count
        let selection = CallMontageFrameRule.reconcile(capture.choice, people: people)
        let chip = CallMontageFrameRule.chip(of: selection)
        VStack(spacing: MeeshySpacing.mdPlus) {
            CallFrameMoodChips(
                chips: CallMontageFrameRule.chips(forPeople: people),
                selected: chip,
                isEnabled: !capture.isRecording
            ) { tapped in
                capture.show(tapped, people: people)
            }
            CallModeCarousel(
                items: CallMontageFrameRule.items(for: chip, people: people),
                selection: choiceBinding(people: people),
                title: CallModeCopy.montageTitle,
                name: CallFrameCopy.choiceName,
                itemSize: Self.thumbnailSize,
                spacing: 12,
                isRecording: capture.isRecording,
                hint: CallModeGestureRule.showsHint(hasSeenHint: hasSeenGestureHint, isRecording: capture.isRecording) ? CallModeCopy.gestureHint : nil,
                onCapturePhoto: shoot,
                onStartRecording: film
            ) { item, isSelected in
                CallModeThumbnail(image: thumbnail(item), symbol: CallFrameCopy.choiceSymbol(item), isSelected: isSelected)
            }
            .id(CallMontageCarouselKey(chip: chip, people: people))
            CallModeActionBar(
                exitHint: CallModeCopy.quitMontageHint,
                onExit: onExit,
                options: [
                    CallModeOption(
                        id: "faces",
                        symbol: "person.crop.square",
                        label: CallCaptureCopy.faces,
                        caption: CallCaptureCopy.faces,
                        hint: CallCaptureCopy.facesHint,
                        isEnabled: capture.status != .working && !capture.isRecording
                    ) {
                        Task { await capture.captureFaces() }
                    }
                ]
            )
        }
        .task(id: CallCaptureSourceKey(subjects: subjects, tracks: tracks)) {
            capture.start(subjects: subjects, tracks: tracks)
        }
        .task(id: call) {
            capture.setFrameTexts(textsProvider.immediateTexts(for: call))
            let resolved = await textsProvider.texts(for: call)
            guard !Task.isCancelled else { return }
            capture.setFrameTexts(resolved)
        }
        .onDisappear {
            hasSeenGestureHint = true
            capture.stop()
        }
    }

    private func thumbnail(_ item: CallMontageChoice) -> CGImage? {
        switch item {
        case .classic(let style): return capture.thumbnails[style]
        case .frame(let id): return capture.frameThumbnail(id)
        }
    }

    private func shoot() {
        hasSeenGestureHint = true
        Task { await capture.capture() }
    }

    private func film() {
        hasSeenGestureHint = true
        Task { await capture.startRecording() }
    }

    private func choiceBinding(people: Int) -> Binding<CallMontageChoice> {
        Binding(
            get: { CallMontageFrameRule.reconcile(capture.choice, people: people) },
            set: { capture.select(choice: $0) }
        )
    }
}

/// L'identité du carrousel : une autre ambiance ou un autre nombre, c'est une autre piste,
/// qui se pose d'emblée sur son choix.
private struct CallMontageCarouselKey: Hashable {
    let chip: CallMontageMoodChip
    let people: Int
}

/// #8625 — la scène du Montage lit l'aperçu sur son flux : à chaque trame,
/// seule l'image se redessine, ni l'écran d'appel ni les commandes.
struct CallMontageLiveStage: View {
    @ObservedObject var capture: CallCaptureController

    var body: some View {
        CallMontageFeedStage(
            feed: capture.previewFeed,
            styleName: CallFrameCopy.choiceName(capture.choice),
            isWorking: capture.status == .working
        )
    }
}

private struct CallMontageFeedStage: View {
    @ObservedObject var feed: CallCapturePreviewFeed
    let styleName: String
    let isWorking: Bool

    var body: some View {
        CallMontageStage(image: feed.image, styleName: styleName, isWorking: isWorking)
    }
}

/// Pendant le film : le bouton stop et le chrono, seuls à suivre le film.
struct CallModeRecordingOverlay: View {
    @ObservedObject var capture: CallCaptureController

    var body: some View {
        if let startedAt = capture.recordingStartedAt {
            CallModeRecordingStop(startedAt: startedAt) {
                Task { await capture.stopRecording() }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .transition(.opacity)
        }
    }
}

struct CallMontageStage: View {
    let image: CGImage?
    let styleName: String
    let isWorking: Bool

    var body: some View {
        ZStack {
            Color.black
            if let image {
                Image(decorative: image, scale: 1)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else {
                ProgressView()
                    .tint(.white)
            }
        }
        .ignoresSafeArea()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(CallCaptureCopy.preview)
        .accessibilityValue(isWorking ? CallCaptureCopy.working : styleName)
    }
}
