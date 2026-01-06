//
//  AdvancedEffectEditorView.swift
//  Meeshy
//
//  Advanced effect editor with:
//  - Precise time positioning with millisecond precision
//  - Interactive parameter graphs for setting keyframe values
//  - Associated transcription text display and editing
//
//  iOS 16+
//

import SwiftUI

// MARK: - Transcription Text Segment

/// Links a portion of transcribed text to a time range
struct TranscriptionTextSegment: Identifiable, Codable, Equatable {
    let id: UUID
    var text: String
    var startTime: TimeInterval
    var endTime: TimeInterval
    var language: String

    init(
        id: UUID = UUID(),
        text: String,
        startTime: TimeInterval,
        endTime: TimeInterval,
        language: String = "fr"
    ) {
        self.id = id
        self.text = text
        self.startTime = startTime
        self.endTime = endTime
        self.language = language
    }

    var duration: TimeInterval {
        endTime - startTime
    }
}

// MARK: - Advanced Effect Editor View

struct AdvancedEffectEditorView: View {
    @ObservedObject var timeline: AudioEffectTimeline
    let segment: AudioEffectRegion
    let audioDuration: TimeInterval

    /// Transcription segments for the audio
    @Binding var transcriptionSegments: [TranscriptionTextSegment]

    /// Current playback time
    let currentTime: TimeInterval

    /// Seek callback
    var onSeek: ((TimeInterval) -> Void)?

    /// Play preview from time
    var onPlayFromTime: ((TimeInterval) -> Void)?

    /// Dismiss callback
    let onDismiss: () -> Void

    // MARK: - State

    @State private var editedStartTime: TimeInterval
    @State private var editedEndTime: TimeInterval
    @State private var editedParameters: [EffectParameterConfig]
    @State private var selectedParameterIndex: Int = 0
    @State private var isEditingText = false
    @State private var editingTextSegmentId: UUID?
    @State private var editedText: String = ""
    @State private var showPrecisionInput = false
    @State private var precisionInputType: PrecisionInputType = .start

    // Graph interaction
    @State private var graphTouchLocation: CGPoint?
    @State private var pendingKeyframeValue: Double?
    @State private var pendingKeyframeTime: TimeInterval?

    enum PrecisionInputType {
        case start, end
    }

    // MARK: - Init

    init(
        timeline: AudioEffectTimeline,
        segment: AudioEffectRegion,
        audioDuration: TimeInterval,
        transcriptionSegments: Binding<[TranscriptionTextSegment]>,
        currentTime: TimeInterval,
        onSeek: ((TimeInterval) -> Void)? = nil,
        onPlayFromTime: ((TimeInterval) -> Void)? = nil,
        onDismiss: @escaping () -> Void
    ) {
        self.timeline = timeline
        self.segment = segment
        self.audioDuration = audioDuration
        self._transcriptionSegments = transcriptionSegments
        self.currentTime = currentTime
        self.onSeek = onSeek
        self.onPlayFromTime = onPlayFromTime
        self.onDismiss = onDismiss

        self._editedStartTime = State(initialValue: segment.startTime)
        self._editedEndTime = State(initialValue: segment.endTime)
        self._editedParameters = State(initialValue: segment.parameterConfigs)
    }

    // MARK: - Computed

    private var effectDefinition: AudioEffectDefinition? {
        segment.effectDefinition
    }

    private var effectColor: Color {
        effectDefinition?.color ?? .gray
    }

    private var editedDuration: TimeInterval {
        editedEndTime - editedStartTime
    }

    /// Get transcription text within the segment's time range
    private var segmentTranscription: [TranscriptionTextSegment] {
        transcriptionSegments.filter { seg in
            seg.startTime < editedEndTime && seg.endTime > editedStartTime
        }
    }

    /// Combined text for the segment
    private var combinedTranscriptionText: String {
        segmentTranscription.map { $0.text }.joined(separator: " ")
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Effect header
                    effectHeaderSection

                    // Precision time controls
                    precisionTimeSection

                    // Timeline preview with text
                    timelinePreviewWithTextSection

                    // Interactive parameter graph
                    if !editedParameters.isEmpty {
                        interactiveParameterGraphSection
                    }

                    // Transcription text section
                    transcriptionTextSection

                    Spacer(minLength: 20)
                }
                .padding()
            }
            .navigationTitle("Éditeur avancé")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") {
                        onDismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Appliquer") {
                        applyChanges()
                        onDismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
        .sheet(isPresented: $showPrecisionInput) {
            precisionInputSheet
        }
        .sheet(isPresented: $isEditingText) {
            textEditingSheet
        }
    }

    // MARK: - Effect Header

    private var effectHeaderSection: some View {
        HStack(spacing: 16) {
            // Effect icon
            ZStack {
                Circle()
                    .fill(effectColor.opacity(0.2))
                    .frame(width: 56, height: 56)

                Image(systemName: effectDefinition?.icon ?? "waveform")
                    .font(.system(size: 24))
                    .foregroundColor(effectColor)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(effectDefinition?.displayName ?? "Effet")
                    .font(.system(size: 20, weight: .semibold))

                Text("Durée: \(formatTime(editedDuration))")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            Spacer()

            // Play preview button
            Button {
                onPlayFromTime?(editedStartTime)
            } label: {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 44))
                    .foregroundColor(effectColor)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(16)
    }

    // MARK: - Precision Time Section

    private var precisionTimeSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Position temporelle")
                    .font(.headline)

                Spacer()

                // Precision mode toggle
                Text("Précision: ms")
                    .font(.caption)
                    .foregroundColor(.green)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.green.opacity(0.15))
                    .cornerRadius(6)
            }

            // Start time row
            precisionTimeRow(
                label: "Début",
                time: $editedStartTime,
                color: .blue,
                range: 0...(editedEndTime - 0.1),
                inputType: .start
            )

            // End time row
            precisionTimeRow(
                label: "Fin",
                time: $editedEndTime,
                color: .green,
                range: (editedStartTime + 0.1)...audioDuration,
                inputType: .end
            )

            // Duration display
            HStack {
                Label("Durée", systemImage: "timer")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Spacer()

                Text(formatTimeWithMs(editedDuration))
                    .font(.system(size: 18, weight: .semibold, design: .monospaced))
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
    }

    private func precisionTimeRow(
        label: String,
        time: Binding<TimeInterval>,
        color: Color,
        range: ClosedRange<TimeInterval>,
        inputType: PrecisionInputType
    ) -> some View {
        VStack(spacing: 8) {
            HStack {
                Text(label)
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Spacer()

                // Precise time display - tappable for manual input
                Button {
                    precisionInputType = inputType
                    showPrecisionInput = true
                } label: {
                    HStack(spacing: 4) {
                        Text(formatTimeWithMs(time.wrappedValue))
                            .font(.system(size: 16, weight: .medium, design: .monospaced))

                        Image(systemName: "pencil.circle.fill")
                            .font(.system(size: 14))
                    }
                    .foregroundColor(color)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(color.opacity(0.15))
                    .cornerRadius(8)
                }
            }

            // Slider
            Slider(value: time, in: range, step: 0.001)
                .tint(color)

            // Fine adjustment buttons
            HStack(spacing: 8) {
                ForEach([-1.0, -0.1, -0.01, 0.01, 0.1, 1.0], id: \.self) { adjustment in
                    fineAdjustButton(
                        adjustment: adjustment,
                        time: time,
                        range: range,
                        color: color
                    )
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private func fineAdjustButton(
        adjustment: TimeInterval,
        time: Binding<TimeInterval>,
        range: ClosedRange<TimeInterval>,
        color: Color
    ) -> some View {
        Button {
            let newValue = max(range.lowerBound, min(time.wrappedValue + adjustment, range.upperBound))
            time.wrappedValue = newValue
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } label: {
            Text(formatAdjustment(adjustment))
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(adjustment > 0 ? .green : .orange)
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .background(Color(.systemGray5))
                .cornerRadius(4)
        }
    }

    // MARK: - Timeline Preview with Text

    private var timelinePreviewWithTextSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Aperçu")
                .font(.headline)

            GeometryReader { geometry in
                ZStack(alignment: .topLeading) {
                    // Background
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(.systemGray6))

                    // Transcription segments as background text indicators
                    ForEach(segmentTranscription) { textSeg in
                        let startX = max(0, (textSeg.startTime - editedStartTime) / editedDuration) * geometry.size.width
                        let endX = min(1, (textSeg.endTime - editedStartTime) / editedDuration) * geometry.size.width
                        let width = max(4, endX - startX)

                        RoundedRectangle(cornerRadius: 4)
                            .fill(Color.blue.opacity(0.15))
                            .frame(width: width, height: 60)
                            .offset(x: startX, y: 10)
                    }

                    // Effect segment
                    let effectWidth = geometry.size.width
                    RoundedRectangle(cornerRadius: 6)
                        .fill(effectColor.opacity(0.6))
                        .frame(width: effectWidth, height: 40)
                        .offset(y: 20)
                        .overlay(
                            HStack {
                                Image(systemName: effectDefinition?.icon ?? "waveform")
                                    .foregroundColor(.white)
                                Text(effectDefinition?.displayName ?? "")
                                    .font(.caption)
                                    .foregroundColor(.white)
                            }
                            .offset(y: 20)
                        )

                    // Current time indicator
                    if currentTime >= editedStartTime && currentTime <= editedEndTime {
                        let playheadX = ((currentTime - editedStartTime) / editedDuration) * geometry.size.width
                        Rectangle()
                            .fill(Color.red)
                            .frame(width: 2, height: 70)
                            .offset(x: playheadX - 1, y: 5)
                    }
                }
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onEnded { value in
                            let progress = value.location.x / geometry.size.width
                            let time = editedStartTime + progress * editedDuration
                            onSeek?(time)
                        }
                )
            }
            .frame(height: 80)

            // Time markers
            HStack {
                Text(formatTimeWithMs(editedStartTime))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.secondary)
                Spacer()
                Text(formatTimeWithMs((editedStartTime + editedEndTime) / 2))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.secondary)
                Spacer()
                Text(formatTimeWithMs(editedEndTime))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.secondary)
            }
        }
    }

    // MARK: - Interactive Parameter Graph

    private var interactiveParameterGraphSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Paramètres")
                    .font(.headline)

                Spacer()

                // Help text
                Text("Appuyez sur le graphe pour ajouter un keyframe")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            // Parameter selector tabs
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(editedParameters.enumerated()), id: \.element.id) { index, param in
                        parameterTab(param: param, index: index)
                    }
                }
            }

            // Interactive graph for selected parameter
            if selectedParameterIndex < editedParameters.count {
                interactiveGraph(for: editedParameters[selectedParameterIndex])
            }

            // Pending keyframe confirmation
            if let pendingTime = pendingKeyframeTime, let pendingValue = pendingKeyframeValue {
                pendingKeyframeCard(time: pendingTime, value: pendingValue)
            }

            // Keyframes list
            if selectedParameterIndex < editedParameters.count {
                keyframesList(for: selectedParameterIndex)
            }
        }
    }

    private func parameterTab(param: EffectParameterConfig, index: Int) -> some View {
        Button {
            withAnimation {
                selectedParameterIndex = index
            }
        } label: {
            HStack(spacing: 6) {
                Circle()
                    .fill(parameterColor(for: index))
                    .frame(width: 8, height: 8)

                Text(param.displayName)
                    .font(.system(size: 13, weight: .medium))

                if !param.keyframes.isEmpty {
                    Text("\(param.keyframes.count)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.orange)
                        .cornerRadius(10)
                }
            }
            .foregroundColor(selectedParameterIndex == index ? .white : .primary)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(selectedParameterIndex == index ? effectColor : Color(.systemGray5))
            )
        }
    }

    private func interactiveGraph(for param: EffectParameterConfig) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // Value range labels
            HStack {
                Text(formatParamValue(param.maxValue, param: param))
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(.secondary)
                Spacer()
            }

            // Graph
            GeometryReader { geometry in
                ZStack {
                    // Background grid
                    Canvas { context, size in
                        // Horizontal lines
                        for i in 0...4 {
                            let y = size.height * CGFloat(i) / 4
                            var path = Path()
                            path.move(to: CGPoint(x: 0, y: y))
                            path.addLine(to: CGPoint(x: size.width, y: y))
                            context.stroke(path, with: .color(.gray.opacity(0.2)), lineWidth: 1)
                        }

                        // Vertical lines (time)
                        for i in 0...10 {
                            let x = size.width * CGFloat(i) / 10
                            var path = Path()
                            path.move(to: CGPoint(x: x, y: 0))
                            path.addLine(to: CGPoint(x: x, y: size.height))
                            context.stroke(path, with: .color(.gray.opacity(0.2)), lineWidth: 1)
                        }
                    }

                    // Parameter curve
                    Path { path in
                        let steps = 100
                        for i in 0...steps {
                            let t = Double(i) / Double(steps)
                            let relativeTime = t * editedDuration
                            let value = param.valueAt(relativeTime: relativeTime)
                            let x = t * geometry.size.width
                            let y = (1 - value) * geometry.size.height

                            if i == 0 {
                                path.move(to: CGPoint(x: x, y: y))
                            } else {
                                path.addLine(to: CGPoint(x: x, y: y))
                            }
                        }
                    }
                    .stroke(effectColor, lineWidth: 2.5)

                    // Keyframe diamonds
                    ForEach(param.keyframes) { keyframe in
                        let x = (keyframe.relativeTime / editedDuration) * geometry.size.width
                        let y = (1 - keyframe.value) * geometry.size.height

                        KeyframeDiamondLarge(
                            color: effectColor,
                            onDelete: {
                                deleteKeyframe(keyframe.id)
                            }
                        )
                        .position(x: x, y: y)
                    }

                    // Pending keyframe indicator
                    if let touchLocation = graphTouchLocation {
                        Circle()
                            .stroke(Color.orange, lineWidth: 2)
                            .fill(Color.orange.opacity(0.3))
                            .frame(width: 20, height: 20)
                            .position(touchLocation)
                    }

                    // Current time indicator
                    if currentTime >= editedStartTime && currentTime <= editedEndTime {
                        let relativeTime = currentTime - editedStartTime
                        let x = (relativeTime / editedDuration) * geometry.size.width

                        Rectangle()
                            .fill(Color.red.opacity(0.8))
                            .frame(width: 2, height: geometry.size.height)
                            .offset(x: x - geometry.size.width / 2)
                    }
                }
                .background(Color(.systemGray6))
                .cornerRadius(8)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            graphTouchLocation = value.location
                        }
                        .onEnded { value in
                            // Calculate time and value from touch position
                            let clampedX = max(0, min(value.location.x, geometry.size.width))
                            let clampedY = max(0, min(value.location.y, geometry.size.height))

                            let relativeTime = (clampedX / geometry.size.width) * editedDuration
                            let normalizedValue = 1 - (clampedY / geometry.size.height)

                            pendingKeyframeTime = relativeTime
                            pendingKeyframeValue = normalizedValue
                            graphTouchLocation = nil

                            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        }
                )
            }
            .frame(height: 150)

            // Min value label
            HStack {
                Text(formatParamValue(param.minValue, param: param))
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(.secondary)
                Spacer()
            }

            // Time labels
            HStack {
                Text("0.0s")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(.secondary)
                Spacer()
                Text(String(format: "%.2fs", editedDuration))
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundColor(.secondary)
            }
        }
    }

    private func pendingKeyframeCard(time: TimeInterval, value: Double) -> some View {
        HStack(spacing: 16) {
            // Info
            VStack(alignment: .leading, spacing: 4) {
                Text("Nouveau keyframe")
                    .font(.subheadline.weight(.medium))

                HStack(spacing: 12) {
                    Label(String(format: "%.3fs", time), systemImage: "clock")

                    if selectedParameterIndex < editedParameters.count {
                        let param = editedParameters[selectedParameterIndex]
                        let actualValue = param.minValue + value * (param.maxValue - param.minValue)
                        Label(formatParamValue(actualValue, param: param), systemImage: "slider.horizontal.3")
                    }
                }
                .font(.caption)
                .foregroundColor(.secondary)
            }

            Spacer()

            // Cancel
            Button {
                pendingKeyframeTime = nil
                pendingKeyframeValue = nil
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundColor(.secondary)
            }

            // Confirm
            Button {
                addKeyframe(at: time, value: value)
                pendingKeyframeTime = nil
                pendingKeyframeValue = nil
            } label: {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title2)
                    .foregroundColor(.green)
            }
        }
        .padding()
        .background(Color.orange.opacity(0.15))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.orange, lineWidth: 1)
        )
    }

    private func keyframesList(for paramIndex: Int) -> some View {
        let param = editedParameters[paramIndex]

        return VStack(alignment: .leading, spacing: 8) {
            if !param.keyframes.isEmpty {
                Text("Keyframes (\(param.keyframes.count))")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                ForEach(param.keyframes.sorted { $0.relativeTime < $1.relativeTime }) { keyframe in
                    HStack {
                        Image(systemName: "diamond.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.orange)

                        Text(String(format: "%.3fs", keyframe.relativeTime))
                            .font(.system(size: 13, design: .monospaced))

                        Spacer()

                        let actualValue = param.minValue + keyframe.value * (param.maxValue - param.minValue)
                        Text(formatParamValue(actualValue, param: param))
                            .font(.system(size: 13, design: .monospaced))
                            .foregroundColor(.secondary)

                        Button {
                            deleteKeyframe(keyframe.id)
                        } label: {
                            Image(systemName: "trash")
                                .font(.system(size: 12))
                                .foregroundColor(.red)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(.systemGray5))
                    .cornerRadius(8)
                }
            }
        }
    }

    // MARK: - Transcription Text Section

    private var transcriptionTextSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Texte associé")
                    .font(.headline)

                Spacer()

                if !segmentTranscription.isEmpty {
                    Text("\(segmentTranscription.count) segment(s)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            if segmentTranscription.isEmpty {
                // No transcription
                HStack {
                    Image(systemName: "text.bubble")
                        .foregroundColor(.secondary)
                    Text("Aucune transcription pour cette section")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(12)
            } else {
                // Transcription segments
                ForEach(segmentTranscription) { textSeg in
                    transcriptionTextCard(textSeg)
                }
            }
        }
    }

    private func transcriptionTextCard(_ textSeg: TranscriptionTextSegment) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // Time range header
            HStack {
                Label(
                    "\(formatTimeWithMs(textSeg.startTime)) → \(formatTimeWithMs(textSeg.endTime))",
                    systemImage: "clock"
                )
                .font(.caption)
                .foregroundColor(.secondary)

                Spacer()

                // Edit button
                Button {
                    editingTextSegmentId = textSeg.id
                    editedText = textSeg.text
                    isEditingText = true
                } label: {
                    Image(systemName: "pencil")
                        .font(.system(size: 14))
                        .foregroundColor(.blue)
                }
            }

            // Text content
            Text(textSeg.text)
                .font(.body)
                .foregroundColor(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)

            // Word count
            let wordCount = textSeg.text.split(separator: " ").count
            Text("\(wordCount) mots")
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.blue.opacity(0.3), lineWidth: 1)
        )
    }

    // MARK: - Precision Input Sheet

    private var precisionInputSheet: some View {
        NavigationStack {
            PrecisionTimeInputView(
                time: precisionInputType == .start ? $editedStartTime : $editedEndTime,
                maxTime: precisionInputType == .start ? editedEndTime - 0.1 : audioDuration,
                minTime: precisionInputType == .start ? 0 : editedStartTime + 0.1
            )
            .navigationTitle(precisionInputType == .start ? "Début précis" : "Fin précise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") {
                        showPrecisionInput = false
                    }
                }
            }
        }
        .presentationDetents([.height(300)])
    }

    // MARK: - Text Editing Sheet

    private var textEditingSheet: some View {
        NavigationStack {
            VStack(spacing: 16) {
                if let segId = editingTextSegmentId,
                   let seg = transcriptionSegments.first(where: { $0.id == segId }) {

                    // Original text (read-only)
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Texte original")
                            .font(.caption)
                            .foregroundColor(.secondary)

                        Text(seg.text)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(.systemGray6))
                            .cornerRadius(8)
                    }

                    // Edited text
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Nouvelle version")
                            .font(.caption)
                            .foregroundColor(.secondary)

                        TextEditor(text: $editedText)
                            .frame(minHeight: 100)
                            .padding(8)
                            .background(Color(.systemGray6))
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color.blue, lineWidth: 1)
                            )
                    }

                    // Word count comparison
                    HStack {
                        let originalWords = seg.text.split(separator: " ").count
                        let newWords = editedText.split(separator: " ").count

                        Text("Original: \(originalWords) mots")
                            .font(.caption)
                            .foregroundColor(.secondary)

                        Spacer()

                        Text("Modifié: \(newWords) mots")
                            .font(.caption)
                            .foregroundColor(newWords != originalWords ? .orange : .secondary)
                    }
                }

                Spacer()
            }
            .padding()
            .navigationTitle("Éditer le texte")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") {
                        isEditingText = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") {
                        saveTextChanges()
                        isEditingText = false
                    }
                    .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium])
    }

    // MARK: - Actions

    private func addKeyframe(at relativeTime: TimeInterval, value: Double) {
        guard selectedParameterIndex < editedParameters.count else { return }

        let keyframe = EffectParameterKeyframe(
            parameterName: editedParameters[selectedParameterIndex].parameterName,
            relativeTime: relativeTime,
            value: value
        )

        editedParameters[selectedParameterIndex].keyframes.append(keyframe)
        editedParameters[selectedParameterIndex].keyframes.sort { $0.relativeTime < $1.relativeTime }

        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    private func deleteKeyframe(_ keyframeId: UUID) {
        guard selectedParameterIndex < editedParameters.count else { return }
        editedParameters[selectedParameterIndex].keyframes.removeAll { $0.id == keyframeId }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    private func saveTextChanges() {
        guard let segId = editingTextSegmentId,
              let index = transcriptionSegments.firstIndex(where: { $0.id == segId }) else {
            return
        }

        transcriptionSegments[index].text = editedText
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    private func applyChanges() {
        // Remove old segment
        timeline.removeSegment(segment.id)

        // Add updated segment
        timeline.addSegmentWithParameters(
            effectType: segment.effectType,
            startTime: editedStartTime,
            endTime: editedEndTime,
            parameterConfigs: editedParameters
        )

        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    // MARK: - Helpers

    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    private func formatTimeWithMs(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        let ms = Int((time.truncatingRemainder(dividingBy: 1)) * 1000)
        return String(format: "%d:%02d.%03d", minutes, seconds, ms)
    }

    private func formatAdjustment(_ value: TimeInterval) -> String {
        if abs(value) >= 1 {
            return String(format: "%+.0fs", value)
        } else if abs(value) >= 0.1 {
            return String(format: "%+.1fs", value)
        } else {
            return String(format: "%+.0fms", value * 1000)
        }
    }

    private func formatParamValue(_ value: Double, param: EffectParameterConfig) -> String {
        if param.parameterName.contains("pitch") || param.parameterName.contains("Frequency") {
            return String(format: "%.0f Hz", value)
        } else if param.parameterName.contains("rate") || param.parameterName.contains("Time") {
            return String(format: "%.2fx", value)
        } else {
            return String(format: "%.0f%%", value)
        }
    }

    private func parameterColor(for index: Int) -> Color {
        let colors: [Color] = [.blue, .green, .purple, .orange, .pink, .cyan]
        return colors[index % colors.count]
    }
}

// MARK: - Precision Time Input View

struct PrecisionTimeInputView: View {
    @Binding var time: TimeInterval
    let maxTime: TimeInterval
    let minTime: TimeInterval

    @State private var minutes: Int = 0
    @State private var seconds: Int = 0
    @State private var milliseconds: Int = 0

    var body: some View {
        VStack(spacing: 24) {
            // Current time display
            Text(String(format: "%d:%02d.%03d", minutes, seconds, milliseconds))
                .font(.system(size: 36, weight: .bold, design: .monospaced))

            // Pickers
            HStack(spacing: 20) {
                // Minutes
                VStack {
                    Text("min")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Picker("Minutes", selection: $minutes) {
                        ForEach(0..<60) { m in
                            Text("\(m)").tag(m)
                        }
                    }
                    .pickerStyle(.wheel)
                    .frame(width: 60, height: 120)
                    .clipped()
                }

                Text(":")
                    .font(.title)
                    .foregroundColor(.secondary)

                // Seconds
                VStack {
                    Text("sec")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Picker("Seconds", selection: $seconds) {
                        ForEach(0..<60) { s in
                            Text(String(format: "%02d", s)).tag(s)
                        }
                    }
                    .pickerStyle(.wheel)
                    .frame(width: 60, height: 120)
                    .clipped()
                }

                Text(".")
                    .font(.title)
                    .foregroundColor(.secondary)

                // Milliseconds
                VStack {
                    Text("ms")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Picker("Milliseconds", selection: $milliseconds) {
                        ForEach(0..<1000) { ms in
                            Text(String(format: "%03d", ms)).tag(ms)
                        }
                    }
                    .pickerStyle(.wheel)
                    .frame(width: 80, height: 120)
                    .clipped()
                }
            }
        }
        .padding()
        .onAppear {
            updateComponentsFromTime()
        }
        .onChange(of: minutes) { _, _ in updateTimeFromComponents() }
        .onChange(of: seconds) { _, _ in updateTimeFromComponents() }
        .onChange(of: milliseconds) { _, _ in updateTimeFromComponents() }
    }

    private func updateComponentsFromTime() {
        minutes = Int(time) / 60
        seconds = Int(time) % 60
        milliseconds = Int((time.truncatingRemainder(dividingBy: 1)) * 1000)
    }

    private func updateTimeFromComponents() {
        let newTime = Double(minutes * 60 + seconds) + Double(milliseconds) / 1000.0
        time = max(minTime, min(newTime, maxTime))
    }
}

// MARK: - Large Keyframe Diamond

struct KeyframeDiamondLarge: View {
    let color: Color
    var onDelete: (() -> Void)?

    @State private var showMenu = false

    var body: some View {
        ZStack {
            Rectangle()
                .fill(color)
                .frame(width: 14, height: 14)
                .rotationEffect(.degrees(45))
                .shadow(color: .black.opacity(0.3), radius: 2, x: 0, y: 1)

            Rectangle()
                .stroke(Color.white, lineWidth: 2)
                .frame(width: 14, height: 14)
                .rotationEffect(.degrees(45))
        }
        .contentShape(Rectangle().size(width: 30, height: 30))
        .onLongPressGesture {
            showMenu = true
        }
        .confirmationDialog("Keyframe", isPresented: $showMenu) {
            Button("Supprimer", role: .destructive) {
                onDelete?()
            }
            Button("Annuler", role: .cancel) {}
        }
    }
}

// MARK: - Preview

#Preview("Advanced Effect Editor") {
    @Previewable @State var transcriptions: [TranscriptionTextSegment] = [
        TranscriptionTextSegment(text: "Bonjour, comment ça va?", startTime: 0, endTime: 2),
        TranscriptionTextSegment(text: "Je vais très bien, merci!", startTime: 2, endTime: 4.5),
        TranscriptionTextSegment(text: "Et toi, quoi de neuf?", startTime: 4.5, endTime: 6)
    ]

    let timeline = AudioEffectTimeline(duration: 10)
    let segment = AudioEffectRegion(
        effectType: .echo,
        startTime: 1,
        endTime: 5
    )

    return AdvancedEffectEditorView(
        timeline: timeline,
        segment: segment,
        audioDuration: 10,
        transcriptionSegments: $transcriptions,
        currentTime: 2.5,
        onDismiss: {}
    )
}
