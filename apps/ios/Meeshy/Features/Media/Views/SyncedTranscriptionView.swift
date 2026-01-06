//
//  SyncedTranscriptionView.swift
//  Meeshy
//
//  Synchronized transcription overlay for audio editor.
//
//  Features:
//  - Word-by-word highlighting synced with playhead
//  - Editable text with inline editing
//  - Trim-aware graying of out-of-range text
//  - Smooth scrolling to follow playhead
//
//  iOS 16+
//

import SwiftUI
import Speech

// MARK: - Timed Word

/// A word with its timing information
struct TimedWord: Identifiable, Equatable {
    let id: UUID
    var text: String
    let startTime: TimeInterval
    let endTime: TimeInterval
    let confidence: Float

    var duration: TimeInterval {
        endTime - startTime
    }

    init(id: UUID = UUID(), text: String, startTime: TimeInterval, endTime: TimeInterval, confidence: Float = 1.0) {
        self.id = id
        self.text = text
        self.startTime = startTime
        self.endTime = endTime
        self.confidence = confidence
    }
}

// MARK: - Timed Transcription

/// Full transcription with word-level timing
struct TimedTranscription: Equatable {
    var words: [TimedWord]
    var fullText: String {
        words.map { $0.text }.joined(separator: " ")
    }

    init(words: [TimedWord] = []) {
        self.words = words
    }

    /// Get words within a time range
    func words(in range: ClosedRange<TimeInterval>) -> [TimedWord] {
        words.filter { $0.startTime >= range.lowerBound && $0.endTime <= range.upperBound }
    }

    /// Check if a word is within a time range
    /// Uses tolerance to handle floating-point precision issues at boundaries
    func isWordInRange(_ word: TimedWord, range: ClosedRange<TimeInterval>) -> Bool {
        let tolerance: TimeInterval = 0.15 // 150ms tolerance for boundary words
        // Word is in range if it starts at or after the range start (with tolerance)
        // AND starts at or before the range end (with tolerance for last words)
        return word.startTime >= (range.lowerBound - tolerance) &&
               word.startTime <= (range.upperBound + tolerance)
    }

    /// Get word at a specific time
    func wordAt(time: TimeInterval) -> TimedWord? {
        words.first { time >= $0.startTime && time < $0.endTime }
    }
}

// MARK: - Timed Transcription Service

/// Service for generating word-level timed transcriptions
@MainActor
final class TimedTranscriptionService: ObservableObject {

    @Published private(set) var isTranscribing = false
    @Published private(set) var transcription: TimedTranscription?
    @Published private(set) var error: String?
    @Published private(set) var progress: Double = 0

    private var currentTask: Task<Void, Never>?

    /// Transcribe audio with word-level timing
    func transcribe(url: URL) async {
        isTranscribing = true
        error = nil
        progress = 0

        do {
            let timedTranscription = try await performTimedTranscription(url: url)
            transcription = timedTranscription
            progress = 1.0
        } catch {
            self.error = error.localizedDescription
        }

        isTranscribing = false
    }

    func cancel() {
        currentTask?.cancel()
        currentTask = nil
        isTranscribing = false
    }

    /// Update a word's text (for editing)
    func updateWord(id: UUID, newText: String) {
        guard var trans = transcription,
              let index = trans.words.firstIndex(where: { $0.id == id }) else { return }

        trans.words[index].text = newText
        transcription = trans
    }

    private func performTimedTranscription(url: URL) async throws -> TimedTranscription {
        // Request authorization
        let status = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }

        guard status == .authorized else {
            throw NSError(domain: "Transcription", code: 1, userInfo: [NSLocalizedDescriptionKey: "Autorisation refusée"])
        }

        guard let recognizer = SFSpeechRecognizer() else {
            throw NSError(domain: "Transcription", code: 2, userInfo: [NSLocalizedDescriptionKey: "Reconnaissance non disponible"])
        }

        let request = SFSpeechURLRecognitionRequest(url: url)
        request.shouldReportPartialResults = false

        // Enable word-level timing if available
        if #available(iOS 16.0, *) {
            request.addsPunctuation = true
        }

        return try await withCheckedThrowingContinuation { continuation in
            recognizer.recognitionTask(with: request) { result, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }

                guard let result = result, result.isFinal else { return }

                var timedWords: [TimedWord] = []

                // Extract word-level timing from transcription segments
                for segment in result.bestTranscription.segments {
                    let word = TimedWord(
                        text: segment.substring,
                        startTime: segment.timestamp,
                        endTime: segment.timestamp + segment.duration,
                        confidence: segment.confidence
                    )
                    timedWords.append(word)
                }

                continuation.resume(returning: TimedTranscription(words: timedWords))
            }
        }
    }
}

// MARK: - Synced Transcription View

/// Transcription view that syncs with audio playhead
struct SyncedTranscriptionView: View {
    @ObservedObject var transcriptionService: TimedTranscriptionService
    let currentTime: TimeInterval
    let totalDuration: TimeInterval
    let trimRange: ClosedRange<TimeInterval>
    let isEditing: Bool
    let onWordTap: ((TimedWord) -> Void)?
    let onTextEdit: ((UUID, String) -> Void)?

    @State private var editingWordId: UUID?
    @State private var editText: String = ""
    @FocusState private var isTextFieldFocused: Bool

    init(
        transcriptionService: TimedTranscriptionService,
        currentTime: TimeInterval,
        totalDuration: TimeInterval,
        trimRange: ClosedRange<TimeInterval>,
        isEditing: Bool = false,
        onWordTap: ((TimedWord) -> Void)? = nil,
        onTextEdit: ((UUID, String) -> Void)? = nil
    ) {
        self.transcriptionService = transcriptionService
        self.currentTime = currentTime
        self.totalDuration = totalDuration
        self.trimRange = trimRange
        self.isEditing = isEditing
        self.onWordTap = onWordTap
        self.onTextEdit = onTextEdit
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if transcriptionService.isTranscribing {
                transcribingView
            } else if let transcription = transcriptionService.transcription {
                transcriptionContent(transcription)
            } else if let error = transcriptionService.error {
                errorView(error)
            } else {
                emptyView
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.black.opacity(0.4))
        )
    }

    // MARK: - Transcribing View

    private var transcribingView: some View {
        HStack(spacing: 12) {
            ProgressView()
                .scaleEffect(0.8)
                .tint(.white)

            Text("Transcription en cours...")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.7))

            Spacer()
        }
    }

    // MARK: - Transcription Content

    private func transcriptionContent(_ transcription: TimedTranscription) -> some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                // Flow layout with wrapping
                WrappingHStack(spacing: 2, lineSpacing: 1) {
                    ForEach(transcription.words) { word in
                        wordView(word, transcription: transcription)
                            .id(word.id)
                    }
                }
                .padding(.horizontal, 4)
                .padding(.vertical, 4)
            }
            .onChange(of: currentTime) { _, newTime in
                // Auto-scroll to current word
                if let currentWord = transcription.wordAt(time: newTime) {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(currentWord.id, anchor: .center)
                    }
                }
            }
        }
        .frame(minHeight: 60, maxHeight: 120)
    }

    private func wordView(_ word: TimedWord, transcription: TimedTranscription) -> some View {
        let isInTrimRange = transcription.isWordInRange(word, range: trimRange)
        let isCurrentWord = currentTime >= word.startTime && currentTime < word.endTime
        let isPastWord = currentTime >= word.endTime && isInTrimRange
        let isEditingThis = editingWordId == word.id

        return Group {
            if isEditingThis {
                // Inline editing
                TextField("", text: $editText)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(Color.yellow.opacity(0.3))
                    )
                    .focused($isTextFieldFocused)
                    .onSubmit {
                        commitEdit(word)
                    }
                    .onAppear {
                        isTextFieldFocused = true
                    }
            } else {
                Text(word.text)
                    .font(.system(size: 14, weight: isCurrentWord ? .semibold : .regular))
                    .foregroundColor(wordColor(isInTrimRange: isInTrimRange, isCurrentWord: isCurrentWord, isPastWord: isPastWord))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 4)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(isCurrentWord ? Color.yellow.opacity(0.3) : Color.clear)
                    )
                    .scaleEffect(isCurrentWord ? 1.05 : 1.0)
                    .animation(.easeOut(duration: 0.15), value: isCurrentWord)
                    .onTapGesture {
                        if isEditing {
                            startEditing(word)
                        } else {
                            onWordTap?(word)
                        }
                    }
            }
        }
    }

    private func wordColor(isInTrimRange: Bool, isCurrentWord: Bool, isPastWord: Bool) -> Color {
        if !isInTrimRange {
            return .white.opacity(0.3)
        }
        if isCurrentWord {
            return .yellow
        }
        if isPastWord {
            return .white.opacity(0.9)
        }
        return .white.opacity(0.6)
    }

    private func startEditing(_ word: TimedWord) {
        editingWordId = word.id
        editText = word.text
    }

    private func commitEdit(_ word: TimedWord) {
        if !editText.isEmpty && editText != word.text {
            transcriptionService.updateWord(id: word.id, newText: editText)
            onTextEdit?(word.id, editText)
        }
        editingWordId = nil
        editText = ""
        isTextFieldFocused = false
    }

    // MARK: - Error View

    private func errorView(_ error: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 14))
                .foregroundColor(.orange)

            Text(error)
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.7))
                .lineLimit(1)

            Spacer()
        }
    }

    // MARK: - Empty View

    private var emptyView: some View {
        HStack(spacing: 8) {
            Image(systemName: "text.bubble")
                .font(.system(size: 14))
                .foregroundColor(.white.opacity(0.5))

            Text("Appuyez pour transcrire")
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.5))

            Spacer()
        }
    }
}

// MARK: - Compact Synced Transcription

/// Compact version showing current word prominently
struct CompactSyncedTranscription: View {
    let transcription: TimedTranscription?
    let currentTime: TimeInterval
    let trimRange: ClosedRange<TimeInterval>

    var body: some View {
        if let transcription = transcription {
            HStack(spacing: 0) {
                // Previous words (faded)
                if let currentWord = transcription.wordAt(time: currentTime),
                   let currentIndex = transcription.words.firstIndex(where: { $0.id == currentWord.id }),
                   currentIndex > 0 {
                    let prevWords = transcription.words[max(0, currentIndex - 2)..<currentIndex]
                    ForEach(Array(prevWords)) { word in
                        Text(word.text + " ")
                            .foregroundColor(.white.opacity(0.4))
                    }
                }

                // Current word (highlighted)
                if let currentWord = transcription.wordAt(time: currentTime) {
                    Text(currentWord.text)
                        .fontWeight(.semibold)
                        .foregroundColor(.yellow)
                }

                // Next words (dimmed)
                if let currentWord = transcription.wordAt(time: currentTime),
                   let currentIndex = transcription.words.firstIndex(where: { $0.id == currentWord.id }),
                   currentIndex < transcription.words.count - 1 {
                    let nextWords = transcription.words[(currentIndex + 1)..<min(currentIndex + 3, transcription.words.count)]
                    ForEach(Array(nextWords)) { word in
                        Text(" " + word.text)
                            .foregroundColor(.white.opacity(0.5))
                    }
                }
            }
            .font(.system(size: 14))
            .lineLimit(1)
        } else {
            Text("...")
                .foregroundColor(.white.opacity(0.4))
        }
    }
}

// MARK: - Wrapping HStack

/// A horizontal stack that wraps content to multiple lines
struct WrappingHStack: Layout {
    var spacing: CGFloat
    var lineSpacing: CGFloat

    init(spacing: CGFloat = 8, lineSpacing: CGFloat = 8) {
        self.spacing = spacing
        self.lineSpacing = lineSpacing
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrangeSubviews(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrangeSubviews(proposal: proposal, subviews: subviews)

        for (index, subview) in subviews.enumerated() {
            let position = result.positions[index]
            subview.place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func arrangeSubviews(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0
        var totalHeight: CGFloat = 0
        var totalWidth: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)

            if currentX + size.width > maxWidth && currentX > 0 {
                // Move to next line
                currentX = 0
                currentY += lineHeight + lineSpacing
                lineHeight = 0
            }

            positions.append(CGPoint(x: currentX, y: currentY))
            currentX += size.width + spacing
            lineHeight = max(lineHeight, size.height)
            totalWidth = max(totalWidth, currentX - spacing)
        }

        totalHeight = currentY + lineHeight
        return (CGSize(width: totalWidth, height: totalHeight), positions)
    }
}

// MARK: - Transcription Editor Sheet

/// Full-screen transcription editor with word-by-word editing
struct TranscriptionEditorSheet: View {
    @ObservedObject var transcriptionService: TimedTranscriptionService
    let onDismiss: () -> Void

    @State private var editingWordId: UUID?
    @State private var editText: String = ""
    @FocusState private var isTextFieldFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                if transcriptionService.isTranscribing {
                    VStack(spacing: 16) {
                        ProgressView()
                            .scaleEffect(1.2)

                        Text("Transcription en cours...")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 60)
                } else if let transcription = transcriptionService.transcription {
                    LazyVStack(alignment: .leading, spacing: 1) {
                        ForEach(transcription.words) { word in
                            wordRow(word)
                        }
                    }
                    .padding(20)
                } else if let error = transcriptionService.error {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 40))
                            .foregroundColor(.orange)

                        Text(error)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                } else {
                    VStack(spacing: 12) {
                        Image(systemName: "text.bubble")
                            .font(.system(size: 40))
                            .foregroundColor(.secondary)

                        Text("Aucune transcription disponible")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 60)
                }
            }
            .navigationTitle("Transcription")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK", action: onDismiss)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder
    private func wordRow(_ word: TimedWord) -> some View {
        let isEditing = editingWordId == word.id

        HStack(spacing: 12) {
            // Time badge
            Text(formatTime(word.startTime))
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Capsule().fill(Color.yellow.opacity(0.8)))

            if isEditing {
                TextField("", text: $editText)
                    .font(.system(size: 16, weight: .medium))
                    .textFieldStyle(.roundedBorder)
                    .focused($isTextFieldFocused)
                    .onSubmit {
                        commitEdit(word)
                    }
                    .onAppear {
                        isTextFieldFocused = true
                    }
            } else {
                Text(word.text)
                    .font(.system(size: 16))
                    .foregroundColor(.primary)
            }

            Spacer()

            // Confidence indicator
            if word.confidence < 0.8 {
                Image(systemName: "questionmark.circle")
                    .font(.system(size: 14))
                    .foregroundColor(.orange)
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(isEditing ? Color.yellow.opacity(0.1) : Color(.systemGray6))
        )
        .contentShape(Rectangle())
        .onTapGesture {
            if !isEditing {
                startEditing(word)
            }
        }
    }

    private func startEditing(_ word: TimedWord) {
        editingWordId = word.id
        editText = word.text
    }

    private func commitEdit(_ word: TimedWord) {
        if !editText.isEmpty && editText != word.text {
            transcriptionService.updateWord(id: word.id, newText: editText)
        }
        editingWordId = nil
        editText = ""
        isTextFieldFocused = false
    }

    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        let ms = Int((time.truncatingRemainder(dividingBy: 1)) * 100)
        return String(format: "%d:%02d.%02d", minutes, seconds, ms)
    }
}

// MARK: - Preview

#Preview("Synced Transcription") {
    ZStack {
        Color.black.ignoresSafeArea()

        VStack(spacing: 20) {
            let service = TimedTranscriptionService()

            SyncedTranscriptionView(
                transcriptionService: service,
                currentTime: 2.5,
                totalDuration: 10.0,
                trimRange: 0.5...9.5,
                isEditing: false
            )
            .padding()
        }
    }
}
