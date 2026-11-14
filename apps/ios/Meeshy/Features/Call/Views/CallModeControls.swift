import SwiftUI
import UIKit
import MeeshyUI

struct CallEffectsModeControls: View {
    @ObservedObject var callManager: CallManager
    @ObservedObject var capture: CallCaptureController
    let subjects: [CallCaptureSubject]
    let tracks: [String: Any]
    /// OPUS-4 — faux avant la connexion : ni photo ni film de mon image, et
    /// la capture ne s'arme pas.
    var capturesMyImage = true
    /// #17901 — le cadre gardé en direct est une couche de la pile, et s'y annule.
    var hold: CallLiveFrameHold = .unavailable
    /// #16979 — LA rangée de genres de la famille, et le genre d'Effets où entrer.
    var genres: [CallEffectKind] = CallEffectsGenreRule.effectsGenres
    var entry: CallEffectsCategory = .face
    /// « Cadres » touché, ou (+) quand il ne reste que les cadres à poser : le Montage.
    var onOpenFrames: () -> Void = {}
    let onExit: () -> Void

    @State private var config = VideoFilterConfig()
    @State private var picked: CallEffectsCategory? = nil
    @State private var barMode: CallEffectsBarMode = CallEffectsBarRule.entering
    @State private var layers = CallEffectLayers()
    @AppStorage(CallModeCopy.gestureHintSeenKey) private var hasSeenGestureHint = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: MeeshySpacing.mdPlus) {
            panelOrCarousel
            CallEffectsBar(
                mode: barMode,
                layers: layers,
                onBack: goBack,
                onSettings: toggleSettings,
                onAddLook: addLook,
                onShowApplied: showApplied,
                looks: { CallEffectsGenreChips(genres: genres, selected: CallEffectsBarRule.pressed(category.kind, in: barMode), onSelect: selectGenre) }
            )
            .padding(.horizontal, MeeshySpacing.lg)
        }
        .onAppear {
            config = callManager.videoFilters.config
            layers = CallEffectsStackRule.layers(layers, frame: hold.heldFrameId, config: config)
        }
        .task(id: CallEffectsCaptureKey(source: CallCaptureSourceKey(subjects: subjects, tracks: tracks), isArmed: capturesMyImage)) {
            guard capturesMyImage else { return }
            capture.update(subjects: subjects, tracks: tracks)
        }
        .onDisappear {
            // Avant la connexion rien n'a été armé : rien à arrêter, et
            // l'arrêt ne doit pas défaire la capture que le mode renaissant
            // dans l'appel établi vient d'armer.
            guard capturesMyImage else { return }
            hasSeenGestureHint = true
            capture.stop()
        }
        .adaptiveOnChange(of: config) { _, newConfig in
            callManager.videoFilters.config = newConfig
            layers = CallEffectsStackRule.layers(layers, frame: hold.heldFrameId, config: newConfig)
        }
        .adaptiveOnChange(of: hold.heldFrameId) { _, held in
            layers = CallEffectsStackRule.layers(layers, frame: held, config: config)
        }
        .adaptiveOnChange(of: layers.isEmpty) { _, isEmpty in
            barMode = CallEffectsBarRule.reconciled(barMode, hasLayers: !isEmpty)
        }
    }

    @ViewBuilder
    private var panelOrCarousel: some View {
        switch barMode {
        case .settings:
            settingsPanel
                .transition(settingsPanelTransition)
        case .applied:
            CallEffectsAppliedPanel(layers: layers, onRemove: remove)
                .transition(settingsPanelTransition)
        case .looks:
            carousel
                .transition(settingsPanelTransition)
        case .base:
            EmptyView()
        }
    }

    /// ‹ referme d'abord le panneau de réglages ouvert (#17947), par le chemin inverse de
    /// « Réglages » ; sinon il revient à l'appel en gardant le look : chaque look touché s'est
    /// appliqué tout de suite.
    private func goBack() {
        HapticFeedback.light()
        guard let closed = CallEffectsBarRule.afterBack(from: barMode) else { return onExit() }
        withAnimation(settingsAnimation) { barMode = closed }
    }

    private func toggleSettings() {
        withAnimation(settingsAnimation) { barMode = CallEffectsBarRule.afterSettings(from: barMode) }
        HapticFeedback.light()
    }

    private var category: CallEffectsCategory { picked ?? entry }

    /// (+) ouvre les looks d'un genre absent de la pile, ou les cadres du Montage quand Visage et
    /// Couleur sont posés ; pile pleine, il n'ajoute plus.
    private func addLook() {
        guard let next = CallEffectsGenreRule.adding(from: category.kind, layers: layers, row: genres) else {
            HapticFeedback.warning()
            return
        }
        guard let look = CallEffectsCategory(kind: next) else { return onOpenFrames() }
        withAnimation(settingsAnimation) {
            barMode = CallEffectsBarRule.afterAddingLook(from: barMode)
            picked = look
        }
        HapticFeedback.light()
    }

    /// Un genre de la rangée ouvre son carrousel : Visage ou Couleur ici, « Cadres » dans le
    /// Montage (le passage de mode porte son propre retour haptique) ; retoucher le genre ouvert
    /// referme son carrousel.
    private func selectGenre(_ genre: CallEffectKind) {
        guard let look = CallEffectsCategory(kind: genre) else { return onOpenFrames() }
        let isOpen = CallEffectsBarRule.pressed(category.kind, in: barMode) == genre
        withAnimation(settingsAnimation) {
            barMode = CallEffectsBarRule.afterGenre(from: barMode, isOpen: isOpen)
            picked = look
        }
        HapticFeedback.light()
    }

    /// C1 généralisée — un look, une couleur ou une déformation choisis s'appliquent aussitôt, et
    /// le carrousel se referme par le chemin inverse : la barre revient à son menu de base.
    private func closeAfterChoice() {
        withAnimation(settingsAnimation) { barMode = CallEffectsBarRule.afterChoice }
        UIAccessibility.post(notification: .layoutChanged, argument: nil)
    }

    /// Appui long sur (+) : la liste des effets appliqués.
    private func showApplied() {
        withAnimation(settingsAnimation) {
            barMode = CallEffectsBarRule.afterShowingApplied(from: barMode, hasLayers: !layers.isEmpty)
        }
    }

    /// Annuler un effet de la liste : cette couche seule tombe, la liste se referme et la barre
    /// revient à son menu de base. Le cadre gardé se retire par le geste qui le garde.
    private func remove(_ kind: CallEffectKind) {
        config = CallEffectsStackRule.removing(kind, from: config)
        if kind == .frame, let held = hold.heldFrameId { hold.toggle(held) }
        layers = layers.removing(kind)
        withAnimation(settingsAnimation) { barMode = CallEffectsBarRule.afterRemoval }
        HapticFeedback.light()
    }

    private var settingsAnimation: Animation {
        .easeInOut(duration: CallEffectsSettingsMotion.duration(reduceMotion: reduceMotion))
    }

    /// P8b.6 — le panneau monte depuis la barre en fondu et y redescend ; sous « Réduire les
    /// animations », la montée tombe à zéro et seul le fondu reste.
    private var settingsPanelTransition: AnyTransition {
        AnyTransition.opacity
            .combined(with: .offset(y: CallEffectsSettingsMotion.panelRise(reduceMotion: reduceMotion)))
    }

    @ViewBuilder
    private var carousel: some View {
        switch category {
        case .face: faceCarousel
        case .color: colorCarousel
        }
    }

    private var faceCarousel: some View {
        CallModeCarousel(
            items: CallEffectsModeRule.faces,
            selection: faceBinding,
            title: CallModeCopy.categoryName(.face),
            name: CallEffectsCopy.name,
            isRecording: capture.isRecording,
            hint: gestureHint,
            onCapturePhoto: photoAction,
            onStartRecording: recordingAction,
            onConfirm: closeAfterChoice
        ) { effect, isSelected in
            CallModeGlyph(art: CallEffectsCopy.art(effect), isSelected: isSelected)
        }
    }

    private var colorCarousel: some View {
        CallModeCarousel(
            items: CallEffectsModeRule.colors,
            selection: colorBinding,
            title: CallModeCopy.categoryName(.color),
            name: CallEffectsCopy.presetName,
            isRecording: capture.isRecording,
            hint: gestureHint,
            onCapturePhoto: photoAction,
            onStartRecording: recordingAction,
            onConfirm: closeAfterChoice
        ) { preset, isSelected in
            CallModeGlyph(art: .symbol(CallEffectsCopy.presetSymbol(preset)), isSelected: isSelected)
        }
    }

    private var photoAction: (() -> Void)? {
        guard capturesMyImage else { return nil }
        return shootMyImage
    }

    private var recordingAction: (() -> Void)? {
        guard capturesMyImage else { return nil }
        return filmMyImage
    }

    private var gestureHint: String? {
        guard capturesMyImage else { return nil }
        return CallModeGestureRule.showsHint(hasSeenHint: hasSeenGestureHint, isRecording: capture.isRecording) ? CallModeCopy.gestureHint : nil
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
            set: { effect in
                guard effect == .none || layers.allows(.face) else { return HapticFeedback.warning() }
                config = config.selectingFaceEffect(effect)
                closeAfterChoice()
            }
        )
    }

    private var colorBinding: Binding<VideoFilterPreset> {
        Binding(
            get: { CallEffectsModeRule.colorSelection(of: config) },
            set: { preset in
                guard preset == .natural || layers.allows(.color) else { return HapticFeedback.warning() }
                config = CallEffectsModeRule.applying(color: preset, to: config)
                closeAfterChoice()
            }
        )
    }

    private var brightnessBinding: Binding<Double> {
        Binding(
            get: { Double(config.brightness) },
            set: { config = config.withBrightness(Float($0)) }
        )
    }

    private var smoothingBinding: Binding<Double> {
        Binding(
            get: { Double(config.skinSmoothingIntensity) },
            set: { config = config.withSmoothingIntensity(Float($0)) }
        )
    }

    private var blurBinding: Binding<Bool> {
        Binding(
            get: { config.backgroundBlurEnabled },
            set: { blurs in
                config = config.withBackgroundBlur(blurs)
                HapticFeedback.light()
            }
        )
    }

    /// #9289 — la Peau lissée choisie se règle ici, au même endroit que la luminosité.
    @ViewBuilder
    private var smoothingRow: some View {
        if config.activeFaceEffect == .smoothing {
            let range = VideoFilterConfig.smoothingIntensityRange
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                Text(CallEffectsCopy.smoothingStrength)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.white)
                    .accessibilityHidden(true)
                Slider(value: smoothingBinding, in: Double(range.lowerBound) ... Double(range.upperBound))
                    .tint(.white)
                    .frame(minHeight: 44)
                    .accessibilityLabel(CallEffectsCopy.smoothingStrength)
                    .accessibilityValue(LocalizedNumber.percent(Int((config.skinSmoothingIntensity * 100).rounded())))
            }
        }
    }

    /// P8b — un verre SÉPARÉ, posé au-dessus de la barre à la place de la bande de looks :
    /// Luminosité, un titre et son curseur ; Flou du fond, une ligne titrée à interrupteur.
    private var settingsPanel: some View {
        CallEffectsPanel(label: CallModeCopy.settingsPanel) {
            smoothingRow
            brightnessRow
            blurRow
        }
    }

    private var brightnessRow: some View {
        let limit = Double(VideoFilterConfig.brightnessLimit)
        let percent = LocalizedNumber.percent(Int((Double(config.brightness) / limit * 100).rounded()))
        return VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(CallEffectsCopy.brightness)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color.white)
                .accessibilityHidden(true)
            Slider(value: brightnessBinding, in: -limit ... limit)
                .tint(.white)
                .frame(minHeight: 44)
                .accessibilityLabel(CallEffectsCopy.brightness)
                .accessibilityValue(percent)
        }
    }

    private var blurRow: some View {
        Toggle(isOn: blurBinding) {
            Text(CallEffectsCopy.blur)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color.white)
        }
        .tint(MeeshyColors.success)
        .frame(minHeight: 44)
    }
}

/// OPUS-4 — la capture de mon image se réarme quand l'appel s'établit.
private struct CallEffectsCaptureKey: Equatable {
    let source: CallCaptureSourceKey
    let isArmed: Bool
}

struct CallMontageModeControls: View {
    @ObservedObject var capture: CallCaptureController
    let subjects: [CallCaptureSubject]
    let tracks: [String: Any]
    /// #8743 — la conversation de l'appel, pour le nom du groupe et l'accent d'un cadre.
    let call: CallFrameCallContext
    /// #17901 — les filtres et le visage de mon image : l'autre moitié de la pile d'effets.
    let filters: VideoFilterPipeline
    var textsProvider: any CallFrameTextsProviding = CallFrameTextsResolver.shared
    /// #9287 — l'interrupteur qui garde le cadre choisi pendant tout l'appel.
    var hold: CallLiveFrameHold = .unavailable
    /// #16979 — LA rangée de genres de la famille ; « Visage » et « Couleur » s'ouvrent dans Effets.
    var genres: [CallEffectKind] = CallEffectsGenreRule.montageGenres
    var onOpenEffects: (CallEffectsCategory) -> Void = { _ in }
    let onExit: () -> Void

    @AppStorage(CallModeCopy.gestureHintSeenKey) private var hasSeenGestureHint = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var barMode: CallEffectsBarMode = CallEffectsBarRule.entering
    @State private var layers = CallEffectLayers()

    private static let thumbnailSize = CGSize(width: 48, height: 85)

    var body: some View {
        let people = subjects.count
        VStack(spacing: MeeshySpacing.mdPlus) {
            panelOrCarousel(people: people)
            CallEffectsBar(
                mode: barMode,
                layers: layers,
                settingsHint: CallModeCopy.montageSettingsHint,
                onBack: goBack,
                onSettings: toggleSettings,
                onAddLook: addLook,
                onShowApplied: showApplied,
                looks: { CallEffectsGenreChips(genres: genres, selected: CallEffectsBarRule.pressed(.frame, in: barMode), onSelect: openGenre) }
            )
            .padding(.horizontal, MeeshySpacing.lg)
        }
        .task(id: CallCaptureSourceKey(subjects: subjects, tracks: tracks)) {
            capture.start(subjects: subjects, tracks: tracks)
        }
        .onAppear {
            if let held = hold.heldFrameId { capture.select(choice: .frame(held)) }
            layers = CallEffectsStackRule.layers(layers, frame: chosenFrameId(people: people), config: filters.config)
        }
        .adaptiveOnChange(of: chosenFrameId(people: people)) { _, id in
            layers = CallEffectsStackRule.layers(layers, frame: id, config: filters.config)
        }
        .adaptiveOnChange(of: layers.isEmpty) { _, isEmpty in
            barMode = CallEffectsBarRule.reconciled(barMode, hasLayers: !isEmpty)
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

    // MARK: - La barre d'Effets

    private var settingsAnimation: Animation {
        .easeInOut(duration: CallEffectsSettingsMotion.duration(reduceMotion: reduceMotion))
    }

    private var panelTransition: AnyTransition {
        AnyTransition.opacity
            .combined(with: .offset(y: CallEffectsSettingsMotion.panelRise(reduceMotion: reduceMotion)))
    }

    /// ‹ referme d'abord le panneau de réglages ouvert (#17947) ; sinon il revient à l'appel :
    /// ce qui a été touché s'est appliqué tout de suite.
    private func goBack() {
        HapticFeedback.light()
        guard let closed = CallEffectsBarRule.afterBack(from: barMode) else { return onExit() }
        withAnimation(settingsAnimation) { barMode = closed }
    }

    private func toggleSettings() {
        withAnimation(settingsAnimation) { barMode = CallEffectsBarRule.afterSettings(from: barMode) }
        HapticFeedback.light()
    }

    /// (+) ouvre, dans Effets, un genre absent de la pile, par-dessus le cadre ; pile pleine, ou
    /// Effets non offert, il n'ajoute plus.
    private func addLook() {
        guard let next = CallEffectsGenreRule.adding(from: .frame, layers: layers, row: genres) else {
            return HapticFeedback.warning()
        }
        guard let look = CallEffectsCategory(kind: next) else {
            withAnimation(settingsAnimation) { barMode = CallEffectsBarRule.afterAddingLook(from: barMode) }
            return HapticFeedback.light()
        }
        onOpenEffects(look)
    }

    /// C1 — « Cadres » touché ouvre le carrousel des cadres au-dessus de la barre ; retouché, il le
    /// referme. « Visage » ou « Couleur » ouvre Effets sur ce genre ; le passage de mode porte son
    /// retour haptique.
    private func openGenre(_ genre: CallEffectKind) {
        guard let look = CallEffectsCategory(kind: genre) else {
            let isOpen = CallEffectsBarRule.pressed(.frame, in: barMode) == genre
            withAnimation(settingsAnimation) { barMode = CallEffectsBarRule.afterGenre(from: barMode, isOpen: isOpen) }
            return HapticFeedback.light()
        }
        onOpenEffects(look)
    }

    /// C1 généralisée — un cadre, une déclinaison ou l'option « Cadre » choisis s'appliquent
    /// aussitôt, et le carrousel se referme par le chemin inverse : la barre revient à son menu de
    /// base, l'option « Cadre » restant posée au-dessus d'elle.
    private func closeAfterChoice() {
        withAnimation(settingsAnimation) { barMode = CallEffectsBarRule.afterChoice }
        UIAccessibility.post(notification: .layoutChanged, argument: nil)
    }

    private func showApplied() {
        withAnimation(settingsAnimation) {
            barMode = CallEffectsBarRule.afterShowingApplied(from: barMode, hasLayers: !layers.isEmpty)
        }
    }

    /// Annuler un effet de la liste : cette couche seule tombe, la liste se referme et la barre
    /// revient à son menu de base. Retirer le cadre qu'on garde en direct le relâche par le même
    /// chemin que décocher « Cadre » : l'autre le voit tomber.
    private func remove(_ kind: CallEffectKind) {
        switch kind {
        case .frame:
            capture.select(choice: CallMontageFrameRule.fallback)
            if let held = hold.heldFrameId { hold.toggle(held) }
        case .color, .face:
            filters.config = CallEffectsStackRule.removing(kind, from: filters.config)
        case .landscape, .voice:
            break
        }
        layers = layers.removing(kind)
        withAnimation(settingsAnimation) { barMode = CallEffectsBarRule.afterRemoval }
        HapticFeedback.light()
    }

    /// « Chaque visage » n'a pas de place dessinée sur C1 : il vit dans ce que « Réglages » ouvre.
    private func captureFaces() {
        HapticFeedback.light()
        withAnimation(settingsAnimation) { barMode = CallEffectsBarRule.afterChoice }
        Task { await capture.captureFaces() }
    }

    private func chosenFrameId(people: Int) -> String? {
        guard case .frame(let id) = CallMontageFrameRule.reconcile(capture.choice, people: people) else { return nil }
        return id
    }

    @ViewBuilder
    private func panelOrCarousel(people: Int) -> some View {
        switch barMode {
        case .looks:
            carousel(people: people)
                .transition(panelTransition)
        case .base:
            if let held = holdChip(for: CallMontageFrameRule.reconcile(capture.choice, people: people)) {
                held
                    .transition(.opacity)
            }
        case .settings:
            settingsPanel
                .transition(panelTransition)
        case .applied:
            CallEffectsAppliedPanel(layers: layers, onRemove: remove)
                .transition(panelTransition)
        }
    }

    private var settingsPanel: some View {
        CallEffectsPanel(label: CallModeCopy.settingsPanel) {
            Button(action: captureFaces) {
                HStack(spacing: MeeshySpacing.md) {
                    Image(systemName: "person.crop.square")
                        .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .semibold))
                        .accessibilityHidden(true)
                    Text(CallCaptureCopy.faces)
                        .font(.footnote.weight(.semibold))
                    Spacer(minLength: 0)
                }
                .foregroundStyle(Color.white)
                .frame(minHeight: MeeshyControlSize.tapTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(CallPressButtonStyle())
            .disabled(capture.status == .working || capture.isRecording)
            .accessibilityLabel(CallCaptureCopy.faces)
            .accessibilityHint(CallCaptureCopy.facesHint)
        }
    }

    // MARK: - Les cadres

    private func carousel(people: Int) -> some View {
        let selection = CallMontageFrameRule.reconcile(capture.choice, people: people)
        let chip = CallMontageFrameRule.chip(of: selection)
        let scope = CallMontageFrameRule.scope(of: selection, people: people, requested: capture.requestedFrameScope)
        return VStack(spacing: MeeshySpacing.mdPlus) {
            if let held = holdChip(for: selection) { held }
            CallFrameMoodChips(
                chips: CallMontageFrameRule.chips(forPeople: people, scope: scope),
                selected: chip,
                isEnabled: !capture.isRecording,
                scopeToggle: scopeToggle(scope: scope, people: people)
            ) { tapped in
                capture.show(tapped, people: people)
            }
            CallModeCarousel(
                items: CallMontageFrameRule.items(for: chip, people: people, scope: scope),
                selection: choiceBinding(people: people),
                title: CallModeCopy.montageTitle,
                name: { CallFrameCopy.choiceName(declined($0, people: people)) },
                itemSize: Self.thumbnailSize,
                spacing: 12,
                isRecording: capture.isRecording,
                hint: CallModeGestureRule.showsHint(hasSeenHint: hasSeenGestureHint, isRecording: capture.isRecording) ? CallModeCopy.gestureHint : nil,
                onCapturePhoto: shoot,
                onStartRecording: film,
                onConfirm: closeAfterChoice,
                variants: declinationVariants(people: people)
            ) { item, isSelected in
                cell(item, isSelected: isSelected, people: people)
            }
            .id(CallMontageCarouselKey(chip: chip, people: people, scope: scope))
        }
    }

    /// #12683 — « Plus d'ambiances » en fin de rangée, tant que la mise en avant cache quelque chose pour `n`.
    private func scopeToggle(scope: CallFrameScope, people: Int) -> CallFrameScopeToggle? {
        guard CallFrameSpotlightRule.hidesFrames(forPeople: people) else { return nil }
        let showsAll = scope == .all
        return CallFrameScopeToggle(showsAll: showsAll) {
            capture.setFrameScope(showsAll ? .spotlight : .all, people: people)
        }
    }

    /// Le cadre affiché se garde pendant l'appel d'un toucher sur la puce « Cadre » (C1) ; rien ne
    /// s'offre sur un montage classique ni hors d'un duo vidéo.
    private func holdChip(for selection: CallMontageChoice) -> CallFrameHoldChip? {
        guard case .frame(let id) = selection, CallLiveFrameRule.mayHold(frameId: id, isOffered: hold.isOffered) else { return nil }
        return CallFrameHoldChip(isOn: hold.heldFrameId == id, isEnabled: !capture.isRecording) {
            hold.toggle(id)
            closeAfterChoice()
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

    /// Le carrousel ne connaît que les cadres de base : une déclinaison choisie y montre son cadre (#12685).
    private func choiceBinding(people: Int) -> Binding<CallMontageChoice> {
        Binding(
            get: { CallMontageFrameRule.base(of: CallMontageFrameRule.reconcile(capture.choice, people: people)) },
            set: { choice in
                capture.select(choice: choice)
                closeAfterChoice()
            }
        )
    }

    /// L'élément tel qu'il est posé : le cadre choisi sous sa déclinaison, les autres tels quels.
    private func declined(_ item: CallMontageChoice, people: Int) -> CallMontageChoice {
        let current = CallMontageFrameRule.reconcile(capture.choice, people: people)
        return CallMontageFrameRule.base(of: current) == item ? current : item
    }

    @ViewBuilder
    private func cell(_ item: CallMontageChoice, isSelected: Bool, people: Int) -> some View {
        let declinations = CallMontageFrameRule.declinations(of: item)
        if isSelected, declinations.count > 1, case .frame(let id) = declined(item, people: people) {
            CallFrameDeclinationPager(ids: declinations, selected: id, isSelected: isSelected, symbol: CallFrameCopy.choiceSymbol(item),
                                      thumbnail: { capture.frameThumbnail($0) }, onSelect: { chooseDeclination($0) })
        } else {
            CallModeThumbnail(image: thumbnail(item), symbol: CallFrameCopy.choiceSymbol(item), isSelected: isSelected)
        }
    }

    /// #18192 — à la voix, les déclinaisons du cadre annoncé se parcourent sans s'appliquer ; seule
    /// l'activation du carrousel pose celle qui est annoncée et rend le menu de base.
    private func declinationVariants(people: Int) -> CallModeCarouselVariants<CallMontageChoice> {
        CallModeCarouselVariants(
            of: { CallMontageFrameRule.declinations(of: $0).map { CallMontageChoice.frame($0) } },
            current: { declined($0, people: people) },
            name: CallFrameCopy.choiceName,
            next: CallFrameCopy.nextDeclination,
            previous: CallFrameCopy.previousDeclination
        )
    }

    /// Une déclinaison choisie est un cadre choisi : elle s'applique et le carrousel se referme.
    private func chooseDeclination(_ id: String) {
        capture.select(choice: .frame(id))
        closeAfterChoice()
    }
}

/// #9287 — ce que la capture sait du cadre en direct : le cadre gardé, si l'appel en sert un,
/// et le geste qui le garde ou le retire.
struct CallLiveFrameHold {
    let heldFrameId: String?
    let isOffered: Bool
    let toggle: (String) -> Void

    static let unavailable = CallLiveFrameHold(heldFrameId: nil, isOffered: false, toggle: { _ in })
}

/// L'identité du carrousel : une autre ambiance ou un autre nombre, c'est une autre piste,
/// qui se pose d'emblée sur son choix.
private struct CallMontageCarouselKey: Hashable {
    let chip: CallMontageMoodChip
    let people: Int
    let scope: CallFrameScope
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

/// #9287 — la scène de la capture : un cadre servi en direct se montre sur le FLUX VIDÉO, à
/// pleine cadence (`CallLiveFrameSurface`) ; un classique, ou un cadre trop riche pour le
/// direct, garde l'aperçu peint quelques fois par seconde. La scène observe le choix seule.
struct CallMontageFrameStage: View {
    @ObservedObject var capture: CallCaptureController
    let isLiveOffered: Bool
    let reduceMotion: Bool
    let people: [CallFramePerson]
    let texts: CallFrameTexts
    let sources: [String: CallLiveFrameVideoSource]

    private var liveDesign: CallFrameDesign? {
        guard isLiveOffered, case .frame(let id) = capture.choice else { return nil }
        return CallLiveFrameRule.display(
            frameId: id,
            participants: people.count,
            isDeviceConstrained: CallVideoDegradation.isDeviceConstrained(),
            reduceMotion: reduceMotion
        ).design
    }

    var body: some View {
        if let design = liveDesign {
            ZStack {
                Color.black
                CallLiveFrameSurface(design: design, people: people, texts: texts, sources: sources,
                                     chromeInsets: (CallView.chromeTopInset, CallView.chromeBottomInset))
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .accessibilityElement()
            .accessibilityLabel(CallLiveFrameCopy.surface(design.displayName()))
        } else {
            CallMontageLiveStage(capture: capture)
        }
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
