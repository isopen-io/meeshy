import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Audio Fullscreen Container (swipe navigation + dismiss)

struct AudioFullscreenView: View {
    let allAudioItems: [ConversationViewModel.AudioItem]
    let startAttachmentId: String
    let contactColor: String
    var onDismissToMessage: ((String) -> Void)?

    @Environment(\.dismiss) private var dismiss
    @State private var currentPageID: String?
    @State private var currentIndex: Int = 0
    @State private var dragOffset: CGFloat = 0
    @State private var isDismissing = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if !allAudioItems.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 0) {
                        ForEach(Array(allAudioItems.enumerated()), id: \.element.id) { index, item in
                            AudioFullscreenPage(
                                item: item,
                                contactColor: contactColor,
                                isActive: index == currentIndex,
                                pageIndex: index,
                                totalPages: allAudioItems.count,
                                onDismiss: { dismissView() },
                                onDismissToMessage: { messageId in
                                    onDismissToMessage?(messageId)
                                    dismiss()
                                }
                            )
                            .containerRelativeFrame(.horizontal)
                            .containerRelativeFrame(.vertical)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.paging)
                .scrollPosition(id: $currentPageID)
                .offset(y: dragOffset)
                .gesture(verticalDismissGesture)
                .opacity(isDismissing ? 0 : 1)
                .onChange(of: currentPageID) { _, newID in
                    guard let newID,
                          let newIdx = allAudioItems.firstIndex(where: { $0.id == newID })
                    else { return }
                    if currentIndex != newIdx {
                        currentIndex = newIdx
                        HapticFeedback.light()
                    }
                }
            }
        }
        .statusBarHidden(true)
        .onAppear {
            if let idx = allAudioItems.firstIndex(where: { $0.attachment.id == startAttachmentId }) {
                currentIndex = idx
                currentPageID = allAudioItems[idx].id
            }
        }
    }

    // MARK: - Vertical Dismiss Gesture

    private var verticalDismissGesture: some Gesture {
        DragGesture(minimumDistance: 40)
            .onChanged { value in
                let vertical = value.translation.height
                if vertical > 0 {
                    dragOffset = vertical * 0.6
                }
            }
            .onEnded { value in
                if value.translation.height > 120 || value.predictedEndTranslation.height > 300 {
                    dismissDownward()
                } else {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        dragOffset = 0
                    }
                }
            }
    }

    private func dismissDownward() {
        let currentItem = allAudioItems.indices.contains(currentIndex) ? allAudioItems[currentIndex] : nil
        withAnimation(.easeOut(duration: 0.25)) {
            dragOffset = UIScreen.main.bounds.height
            isDismissing = true
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            if let item = currentItem {
                onDismissToMessage?(item.message.id)
            }
            dismiss()
        }
    }

    private func dismissView() {
        dismiss()
    }

}

// MARK: - Audio Fullscreen Page (single audio item)

private struct AudioFullscreenPage: View {
    let item: ConversationViewModel.AudioItem
    let contactColor: String
    let isActive: Bool
    let pageIndex: Int
    let totalPages: Int
    var onDismiss: () -> Void
    var onDismissToMessage: ((String) -> Void)?

    @StateObject private var player = AudioPlaybackManager()
    @StateObject private var waveformAnalyzer = AudioWaveformAnalyzer()

    @State private var saveState: SaveState = .idle
    @State private var isSeeking = false
    @State private var seekValue: Double = 0
    @State private var selectedLanguage: String = "orig"
    @State private var showLanguagePicker = false
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var isRequestingTranscription = false

    private enum SaveState { case idle, saving, saved, failed }

    private var attachment: MessageAttachment { item.attachment }
    private var message: Message { item.message }
    private var transcription: MessageTranscription? { item.transcription }
    private var translatedAudios: [MessageTranslatedAudio] { item.translatedAudios }

    private var accent: Color { Color(hex: contactColor) }
    private let fullscreenSpeeds: [PlaybackSpeed] = [.x1_0, .x1_25, .x1_5, .x1_75, .x2_0]

    private var progress: Double {
        guard player.duration > 0 else { return 0 }
        return isSeeking ? seekValue : player.progress
    }

    private var currentLangColor: Color {
        if selectedLanguage == "orig" {
            return Color(hex: LanguageDisplay.colorHex(for: message.originalLanguage))
        }
        return Color(hex: LanguageDisplay.colorHex(for: selectedLanguage))
    }

    private var originalFlag: String {
        LanguageDisplay.from(code: message.originalLanguage)?.flag ?? "\u{1F3B5}"
    }

    private var displaySegments: [TranscriptionDisplaySegment] {
        if selectedLanguage != "orig",
           let audio = translatedAudios.first(where: { $0.targetLanguage == selectedLanguage }),
           !audio.segments.isEmpty {
            return audio.segments.enumerated().map { _, seg in
                TranscriptionDisplaySegment(
                    text: seg.text,
                    startTime: seg.startTime ?? 0,
                    endTime: seg.endTime ?? 0,
                    speakerId: nil,
                    speakerColor: TranscriptionDisplaySegment.speakerPalette[0]
                )
            }
        }
        guard let t = transcription else { return [] }
        return TranscriptionDisplaySegment.buildFrom(t)
    }

    private var estimatedDuration: TimeInterval {
        let metadata = Double(attachment.duration ?? 0) / 1000.0
        if metadata > 0 { return metadata }
        return player.duration
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            topBar
                .padding(.top, 50)
                .padding(.horizontal, 16)

            Spacer()

            VStack(spacing: 16) {
                waveformSection
                    .padding(.horizontal, 24)

                centerControls

                VStack(spacing: 8) {
                    seekBar.padding(.horizontal, 24)
                    timeRow.padding(.horizontal, 24)
                    speedRow.padding(.horizontal, 24)
                }
            }

            // Author info right below controls
            authorInfoRow
                .padding(.horizontal, 20)
                .padding(.top, 14)

            // Transcription (capped height)
            if !displaySegments.isEmpty {
                transcriptionSection
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .frame(maxHeight: 120)
            } else {
                transcriptionEmptyState
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .frame(maxHeight: 120)
            }

            // Language strip right below transcription
            inlineLanguageFlags
                .padding(.horizontal, 16)
                .padding(.top, 10)

            Spacer(minLength: 0)
        }
        .onAppear { startPlayback() }
        .onChange(of: isActive) { _, active in
            if active {
                startPlayback()
            } else {
                player.stop()
            }
        }
        .onDisappear {
            player.stop()
            player.unregisterFromCoordinator()
        }
        .sheet(isPresented: $showLanguagePicker) {
            languagePickerSheet
        }
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(user: user)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private func startPlayback() {
        player.attachmentId = attachment.id
        player.play(urlString: currentAudioUrl)
        loadWaveform()
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack(spacing: 12) {
            Button {
                onDismiss()
                HapticFeedback.light()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.white.opacity(0.2)))
            }

            Spacer()

            HStack(spacing: 6) {
                if totalPages > 1 {
                    Text("\(pageIndex + 1) / \(totalPages)")
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(.ultraThinMaterial.opacity(0.7)))
                        .contentTransition(.numericText())
                        .animation(.spring(response: 0.3), value: pageIndex)
                }
                if let dur = attachment.durationFormatted {
                    Text(dur)
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                }
                if let codec = attachment.codec {
                    Text(codec.uppercased())
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.white.opacity(0.1)))
                }
            }
            .foregroundColor(.white.opacity(0.5))

            Spacer()

            downloadButton
        }
    }

    // MARK: - Author Info

    private var authorInfoRow: some View {
        HStack(spacing: 10) {
            Button {
                selectedProfileUser = ProfileSheetUser.from(message: message)
                HapticFeedback.light()
            } label: {
                MeeshyAvatar(
                    name: message.senderName ?? "?",
                    mode: .custom(34),
                    accentColor: message.senderColor ?? contactColor,
                    avatarURL: message.senderAvatarURL
                )
            }

            Button {
                selectedProfileUser = ProfileSheetUser.from(message: message)
                HapticFeedback.light()
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(message.senderName ?? "?")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)

                    Text(message.createdAt, format: .dateTime.day().month(.abbreviated).hour().minute())
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.4))
                }
            }

            Spacer()

            HStack(spacing: 6) {
                Image(systemName: "waveform")
                    .font(.system(size: 10))
                    .foregroundColor(.white.opacity(0.4))
                if attachment.fileSize > 0 {
                    Text(attachment.fileSizeFormatted)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.35))
                }
            }
        }
    }

    // MARK: - Download Button

    private var downloadButton: some View {
        Button { saveAudio() } label: {
            Group {
                switch saveState {
                case .idle:
                    Image(systemName: "arrow.down.to.line")
                case .saving:
                    ProgressView().tint(.white)
                case .saved:
                    Image(systemName: "checkmark")
                case .failed:
                    Image(systemName: "xmark")
                }
            }
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(.white.opacity(0.9))
            .frame(width: 36, height: 36)
            .background(Circle().fill(Color.white.opacity(0.2)))
        }
        .disabled(saveState == .saving || saveState == .saved)
    }

    // MARK: - Waveform Section

    private var waveformSection: some View {
        GeometryReader { geo in
            let barCount = waveformAnalyzer.samples.isEmpty ? 80 : waveformAnalyzer.samples.count
            let barWidth: CGFloat = 3
            let spacing: CGFloat = 2
            let totalWidth = CGFloat(barCount) * (barWidth + spacing) - spacing
            let needsScroll = totalWidth > geo.size.width
            let playheadBarIndex = max(0, min(barCount - 1, Int(progress * Double(barCount))))

            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    ZStack(alignment: .leading) {
                        HStack(spacing: spacing) {
                            ForEach(0..<barCount, id: \.self) { i in
                                let fraction = Double(i) / Double(barCount)
                                let isPlayed = fraction <= progress
                                let sample = waveformAnalyzer.samples.isEmpty
                                    ? fallbackHeight(index: i)
                                    : CGFloat(waveformAnalyzer.samples[i])
                                let height = max(3, sample * geo.size.height * 0.9)
                                let computedWidth = needsScroll
                                    ? barWidth
                                    : max(2, (geo.size.width - spacing * CGFloat(barCount - 1)) / CGFloat(barCount))

                                RoundedRectangle(cornerRadius: 1.5)
                                    .fill(isPlayed ? accent : Color.white.opacity(0.15))
                                    .frame(width: computedWidth, height: height)
                                    .overlay(
                                        needsScroll && i == playheadBarIndex
                                            ? RoundedRectangle(cornerRadius: 1.5)
                                                .fill(Color.white)
                                                .frame(width: 2, height: geo.size.height * 0.95)
                                            : nil
                                    )
                                    .id("bar-\(i)")
                            }
                        }
                        .frame(height: geo.size.height, alignment: .center)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { location in
                        let contentWidth = needsScroll ? totalWidth : geo.size.width
                        let fraction = max(0, min(1, location.x / contentWidth))
                        player.seek(to: fraction)
                        HapticFeedback.light()
                    }
                }
                .onChange(of: playheadBarIndex) { _, newIdx in
                    guard needsScroll else { return }
                    withAnimation(.linear(duration: 0.2)) {
                        proxy.scrollTo("bar-\(newIdx)", anchor: .center)
                    }
                }
            }
        }
        .frame(height: 80)
    }

    private func fallbackHeight(index: Int) -> CGFloat {
        let seed = Double(index * 7 + 3)
        let value = 0.2 + abs(sin(seed) * 0.4 + cos(seed * 0.5) * 0.3)
        return CGFloat(min(1.0, value))
    }

    // MARK: - Center Controls

    private var centerControls: some View {
        HStack(spacing: 48) {
            Button {
                player.skip(seconds: -10)
                HapticFeedback.light()
            } label: {
                Image(systemName: "gobackward.10")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundColor(.white)
            }

            Button {
                if player.isPlaying || player.progress > 0 {
                    player.togglePlayPause()
                } else {
                    player.play(urlString: currentAudioUrl)
                }
                HapticFeedback.light()
            } label: {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.2))
                        .frame(width: 64, height: 64)

                    if player.isLoading {
                        ProgressView().tint(.white).scaleEffect(0.8)
                    } else {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 32, weight: .bold))
                            .foregroundColor(.white)
                            .offset(x: player.isPlaying ? 0 : 3)
                    }
                }
            }

            Button {
                player.skip(seconds: 10)
                HapticFeedback.light()
            } label: {
                Image(systemName: "goforward.10")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundColor(.white)
            }
        }
    }

    // MARK: - Seek Bar

    private var seekBar: some View {
        GeometryReader { geo in
            let trackHeight: CGFloat = 5
            let thumbSize: CGFloat = 16
            let filledWidth = geo.size.width * progress

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.white.opacity(0.3))
                    .frame(height: trackHeight)

                Capsule()
                    .fill(accent)
                    .frame(width: max(0, filledWidth), height: trackHeight)

                Circle()
                    .fill(Color.white)
                    .frame(width: thumbSize, height: thumbSize)
                    .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                    .offset(x: max(0, min(filledWidth - thumbSize / 2, geo.size.width - thumbSize)))
            }
            .frame(height: max(trackHeight, thumbSize))
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        isSeeking = true
                        seekValue = max(0, min(1, value.location.x / geo.size.width))
                    }
                    .onEnded { value in
                        let fraction = max(0, min(1, value.location.x / geo.size.width))
                        player.seek(to: fraction)
                        isSeeking = false
                        seekValue = 0
                    }
            )
        }
        .frame(height: 16)
    }

    // MARK: - Time Row

    private var timeRow: some View {
        HStack {
            Text(formatMediaDuration(isSeeking ? seekValue * estimatedDuration : player.currentTime))
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundColor(.white.opacity(0.7))

            Spacer()

            Text(formatMediaDuration(estimatedDuration))
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundColor(.white.opacity(0.7))
        }
    }

    // MARK: - Speed Row

    private var speedRow: some View {
        HStack(spacing: 8) {
            ForEach(fullscreenSpeeds, id: \.rawValue) { speed in
                Button {
                    player.setSpeed(speed)
                } label: {
                    Text(speed.label)
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .foregroundColor(player.speed == speed ? .black : .white.opacity(0.7))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            Capsule().fill(
                                player.speed == speed
                                    ? accent
                                    : Color.white.opacity(0.15)
                            )
                        )
                }
            }
        }
    }

    // MARK: - Transcription Section (flexible height, scrollable)

    private var transcriptionSection: some View {
        let activeIdx = displaySegments.firstIndex { player.currentTime >= $0.startTime && player.currentTime < $0.endTime }

        return ScrollView(.vertical, showsIndicators: true) {
            FlowLayout(spacing: 0) {
                ForEach(Array(displaySegments.enumerated()), id: \.element.id) { index, segment in
                    let isActive = index == activeIdx
                    let isPast = activeIdx != nil && index < activeIdx!

                    Button {
                        player.seekToTime(segment.startTime)
                        HapticFeedback.light()
                    } label: {
                        Text(segment.text + " ")
                            .font(.system(size: 15, weight: isActive ? .bold : .regular))
                            .foregroundColor(transcriptionColor(isActive: isActive, isPast: isPast))
                            .padding(.horizontal, isActive ? 3 : 0)
                            .padding(.vertical, isActive ? 2 : 0)
                            .background(
                                RoundedRectangle(cornerRadius: 5)
                                    .fill(currentLangColor.opacity(isActive ? 0.2 : 0))
                            )
                    }
                    .buttonStyle(.plain)
                    .animation(.easeInOut(duration: 0.15), value: isActive)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        }
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(currentLangColor.opacity(0.08))
        )
    }

    // MARK: - Transcription Empty State

    private var transcriptionEmptyState: some View {
        VStack(spacing: 14) {
            Spacer(minLength: 0)

            Image(systemName: "text.word.spacing")
                .font(.system(size: 28, weight: .light))
                .foregroundColor(.white.opacity(0.25))

            Text("Aucune transcription")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.white.opacity(0.4))

            Button {
                requestTranscription()
            } label: {
                HStack(spacing: 6) {
                    if isRequestingTranscription {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.7)
                    } else {
                        Image(systemName: "waveform.and.mic")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    Text("Transcrire")
                        .font(.system(size: 13, weight: .bold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(Capsule().fill(accent.opacity(0.7)))
            }
            .disabled(isRequestingTranscription)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
    }

    private func requestTranscription() {
        guard !isRequestingTranscription else { return }
        isRequestingTranscription = true
        HapticFeedback.light()

        Task {
            do {
                try await AttachmentService.shared.requestTranscription(attachmentId: attachment.id)
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                await MainActor.run {
                    isRequestingTranscription = false
                }
            } catch {
                await MainActor.run {
                    isRequestingTranscription = false
                    HapticFeedback.error()
                }
            }
        }
    }

    // MARK: - Inline Language Flags

    private var inlineLanguageFlags: some View {
        HStack(spacing: 6) {
            languagePill(flag: originalFlag, code: "orig",
                         label: LanguageDisplay.from(code: message.originalLanguage)?.name ?? "Original",
                         isSelected: selectedLanguage == "orig")

            ForEach(translatedAudios, id: \.id) { audio in
                let display = LanguageDisplay.from(code: audio.targetLanguage)
                languagePill(
                    flag: display?.flag ?? "\u{1F310}",
                    code: audio.targetLanguage,
                    label: display?.name ?? audio.targetLanguage,
                    isSelected: selectedLanguage == audio.targetLanguage
                )
            }

            Spacer(minLength: 0)

            Button {
                showLanguagePicker = true
                HapticFeedback.light()
            } label: {
                Image(systemName: "translate")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
                    .frame(width: 26, height: 26)
                    .background(Circle().fill(Color.white.opacity(0.08)))
            }
        }
        .padding(.horizontal, 8)
    }

    private func transcriptionColor(isActive: Bool, isPast: Bool) -> Color {
        if isActive { return currentLangColor }
        if isPast { return .white.opacity(0.7) }
        return .white.opacity(0.35)
    }

    private func languagePill(flag: String, code: String, label: String, isSelected: Bool) -> some View {
        let langColor = code == "orig"
            ? Color(hex: LanguageDisplay.colorHex(for: message.originalLanguage))
            : Color(hex: LanguageDisplay.colorHex(for: code))

        return Button {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                selectedLanguage = code
            }
            if code == "orig" {
                player.play(urlString: attachment.fileUrl)
            } else if let audio = translatedAudios.first(where: { $0.targetLanguage == code }) {
                player.play(urlString: audio.url)
            }
            loadWaveform()
            HapticFeedback.light()
        } label: {
            HStack(spacing: 3) {
                Text(flag).font(.system(size: 12))
                Text(label).font(.system(size: 10, weight: isSelected ? .bold : .medium))
            }
            .foregroundColor(isSelected ? .white : .white.opacity(0.55))
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Capsule().fill(isSelected ? langColor.opacity(0.6) : Color.white.opacity(0.07)))
        }
    }

    // MARK: - Language Picker Sheet

    private var languagePickerSheet: some View {
        NavigationStack {
            List {
                ForEach(sortedLanguages, id: \.code) { lang in
                    let hasAudio = translatedAudios.contains(where: { $0.targetLanguage.lowercased() == lang.code.lowercased() })
                    let isSelected = selectedLanguage == lang.code

                    Button {
                        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                            selectedLanguage = lang.code
                        }
                        if let audio = translatedAudios.first(where: { $0.targetLanguage.lowercased() == lang.code.lowercased() }) {
                            player.play(urlString: audio.url)
                            loadWaveform()
                        }
                        showLanguagePicker = false
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 10) {
                            Text(lang.flag).font(.system(size: 20))

                            Text(lang.name)
                                .font(.system(size: 15, weight: isSelected ? .bold : .regular))
                                .foregroundColor(.primary)

                            Spacer()

                            if hasAudio {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 16))
                                    .foregroundColor(.green)
                            }

                            if isSelected {
                                Image(systemName: "speaker.wave.2.fill")
                                    .font(.system(size: 14))
                                    .foregroundColor(accent)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle("Langues")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Fermer") { showLanguagePicker = false }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var sortedLanguages: [LanguageDisplay] {
        let availableCodes = Set(translatedAudios.map { $0.targetLanguage.lowercased() })
        let allCodes = ["fr", "en", "es", "de", "it", "pt", "nl", "pl", "ro", "sv",
                        "da", "fi", "no", "cs", "hu", "el", "bg", "hr", "sk", "sl",
                        "et", "lv", "lt", "ga", "mt", "ru", "uk", "ar", "he", "tr",
                        "ja", "ko", "zh", "hi", "bn", "th", "vi", "id", "ms", "sw", "am"]

        return allCodes.compactMap { code in
            guard let display = LanguageDisplay.from(code: code) else { return nil }
            return display
        }.sorted { a, b in
            let aHas = availableCodes.contains(a.code.lowercased())
            let bHas = availableCodes.contains(b.code.lowercased())
            if aHas != bHas { return aHas }
            return a.name < b.name
        }
    }

    // MARK: - Helpers

    private var currentAudioUrl: String {
        if selectedLanguage != "orig",
           let audio = translatedAudios.first(where: { $0.targetLanguage == selectedLanguage }) {
            return audio.url
        }
        return attachment.fileUrl
    }

    private func loadWaveform() {
        let url = currentAudioUrl
        let resolved = MeeshyConfig.resolveMediaURL(url)?.absoluteString ?? url
        Task {
            if let data = try? await MediaCacheManager.shared.data(for: resolved) {
                waveformAnalyzer.analyze(data: data)
            }
        }
    }

    private func saveAudio() {
        let url = currentAudioUrl
        guard let resolved = MeeshyConfig.resolveMediaURL(url) else { return }
        saveState = .saving
        HapticFeedback.light()

        Task {
            do {
                let (tempURL, _) = try await URLSession.shared.download(from: resolved)
                let ext = resolved.pathExtension.isEmpty ? "m4a" : resolved.pathExtension
                let tempFile = FileManager.default.temporaryDirectory
                    .appendingPathComponent("audio_\(UUID().uuidString).\(ext)")
                try FileManager.default.moveItem(at: tempURL, to: tempFile)

                let fileURL = tempFile
                let items: [Any] = [fileURL]
                await MainActor.run {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        saveState = .saved
                    }
                    HapticFeedback.success()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        let activityVC = UIActivityViewController(activityItems: items, applicationActivities: nil)
                        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                           let root = windowScene.windows.first?.rootViewController {
                            var topVC = root
                            while let presented = topVC.presentedViewController {
                                topVC = presented
                            }
                            topVC.present(activityVC, animated: true)
                        }
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation { saveState = .idle }
                    }
                }
            } catch {
                await MainActor.run {
                    withAnimation { saveState = .failed }
                    HapticFeedback.error()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation { saveState = .idle }
                    }
                }
            }
        }
    }
}
