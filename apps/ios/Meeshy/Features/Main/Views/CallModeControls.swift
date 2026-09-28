import SwiftUI
import UIKit
import MeeshyUI

struct CallEffectsModeControls: View {
    @ObservedObject var callManager: CallManager
    let onExit: () -> Void

    @State private var config = VideoFilterConfig()
    @State private var original = VideoFilterConfig()
    @State private var category: CallEffectsCategory = .face
    @State private var showsSettings = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 14) {
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
                shutter: CallModeShutter(symbol: "checkmark", label: CallModeCopy.validate, hint: CallModeCopy.validateHint) {
                    finish(validated: true)
                },
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
                    }
                ]
            )
        }
        .onAppear {
            original = callManager.videoFilters.config
            config = original
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
        HStack(spacing: 6) {
            ForEach(CallEffectsCategory.allCases, id: \.self) { item in
                if item != CallEffectsCategory.allCases.first {
                    Text(verbatim: "·")
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.white.opacity(0.5))
                        .accessibilityHidden(true)
                }
                Button {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { category = item }
                    HapticFeedback.light()
                } label: {
                    Text(CallModeCopy.categoryName(item))
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.white.opacity(category == item ? 1 : 0.55))
                        .padding(.horizontal, 8)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(category == item ? [.isButton, .isSelected] : [.isButton])
            }
        }
        .shadow(color: .black.opacity(0.5), radius: 3)
    }

    @ViewBuilder
    private var carousel: some View {
        switch category {
        case .face:
            CallModeCarousel(
                items: CallEffectsModeRule.faces,
                selection: faceBinding,
                title: CallModeCopy.categoryName(.face),
                name: CallEffectsCopy.name
            ) { effect, isSelected in
                CallModeGlyph(art: CallEffectsCopy.art(effect), isSelected: isSelected)
            }
        case .color:
            CallModeCarousel(
                items: CallEffectsModeRule.colors,
                selection: colorBinding,
                title: CallModeCopy.categoryName(.color),
                name: CallEffectsCopy.presetName
            ) { preset, isSelected in
                CallModeGlyph(art: .symbol(CallEffectsCopy.presetSymbol(preset)), isSelected: isSelected)
            }
        }
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
        return HStack(spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "sun.min")
                    .font(.footnote)
                    .foregroundColor(.white.opacity(0.8))
                    .accessibilityHidden(true)
                Slider(value: brightnessBinding, in: -limit ... limit)
                    .tint(.white)
                    .accessibilityLabel(CallEffectsCopy.brightness)
                    .accessibilityValue(percent)
                Image(systemName: "sun.max")
                    .font(.footnote)
                    .foregroundColor(.white.opacity(0.8))
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
        .padding(.horizontal, 24)
    }
}

struct CallMontageModeControls: View {
    @ObservedObject var capture: CallCaptureController
    let subjects: [CallCaptureSubject]
    let tracks: [String: Any]
    let onExit: () -> Void

    private static let thumbnailSize = CGSize(width: 48, height: 85)

    var body: some View {
        VStack(spacing: 14) {
            CallModeCarousel(
                items: CallMontageStyle.allCases,
                selection: styleBinding,
                title: CallModeCopy.montageTitle,
                name: CallCaptureCopy.styleName,
                itemSize: Self.thumbnailSize,
                spacing: 12
            ) { style, isSelected in
                CallModeThumbnail(image: capture.thumbnails[style], symbol: CallCaptureCopy.styleSymbol(style), isSelected: isSelected)
            }
            CallModeActionBar(
                exitHint: CallModeCopy.quitMontageHint,
                onExit: onExit,
                shutter: CallModeShutter(
                    symbol: "camera.fill",
                    label: CallCaptureCopy.shoot,
                    hint: CallCaptureCopy.shootHint,
                    isBusy: capture.status == .working
                ) {
                    Task { await capture.capture() }
                },
                options: [
                    CallModeOption(
                        id: "faces",
                        symbol: "person.crop.square",
                        label: CallCaptureCopy.faces,
                        caption: CallCaptureCopy.faces,
                        hint: CallCaptureCopy.facesHint,
                        isEnabled: capture.status != .working
                    ) {
                        Task { await capture.captureFaces() }
                    }
                ]
            )
        }
        .task(id: CallCaptureSourceKey(subjects: subjects, tracks: tracks)) {
            capture.start(subjects: subjects, tracks: tracks)
        }
        .onDisappear { capture.stop() }
        .adaptiveOnChange(of: capture.status) { _, status in
            guard let outcome = CallCaptureCopy.outcome(status) else { return }
            if outcome.isError {
                FeedbackToastManager.shared.showError(outcome.message)
            } else {
                FeedbackToastManager.shared.showSuccess(outcome.message)
            }
            UIAccessibility.post(notification: .announcement, argument: outcome.message)
        }
    }

    private var styleBinding: Binding<CallMontageStyle> {
        Binding(
            get: { capture.style },
            set: { capture.select($0) }
        )
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
