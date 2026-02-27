import SwiftUI
import MeeshySDK

// MARK: - Story Music Track

public struct StoryMusicTrack: Identifiable, Sendable {
    public let id: String
    public let title: String
    public let artist: String
    public let duration: TimeInterval
    public let previewURL: String?
    public let artworkColor: String

    public init(id: String = UUID().uuidString, title: String, artist: String,
                duration: TimeInterval, previewURL: String? = nil, artworkColor: String = "FF2E63") {
        self.id = id; self.title = title; self.artist = artist
        self.duration = duration; self.previewURL = previewURL
        self.artworkColor = artworkColor
    }
}

// MARK: - Story Music Picker

public struct StoryMusicPicker: View {
    @Binding public var selectedTrack: StoryMusicTrack?
    @Binding public var trimStart: TimeInterval
    @Binding public var trimEnd: TimeInterval

    @State private var searchText = ""
    @State private var isPlaying = false

    @ObservedObject private var theme = ThemeManager.shared

    public init(selectedTrack: Binding<StoryMusicTrack?>, trimStart: Binding<TimeInterval>,
                trimEnd: Binding<TimeInterval>) {
        self._selectedTrack = selectedTrack
        self._trimStart = trimStart; self._trimEnd = trimEnd
    }

    private var sampleTracks: [StoryMusicTrack] {
        [
            StoryMusicTrack(title: "Summer Vibes", artist: "Chill Beats", duration: 180, artworkColor: "FF6B6B"),
            StoryMusicTrack(title: "Night Drive", artist: "Synthwave", duration: 210, artworkColor: "9B59B6"),
            StoryMusicTrack(title: "Morning Coffee", artist: "Lo-Fi", duration: 195, artworkColor: "F8B500"),
            StoryMusicTrack(title: "Electric Dreams", artist: "EDM Mix", duration: 240, artworkColor: "08D9D6"),
            StoryMusicTrack(title: "Acoustic Sunset", artist: "Indie Folk", duration: 165, artworkColor: "2ECC71"),
            StoryMusicTrack(title: "Urban Jungle", artist: "Hip Hop", duration: 200, artworkColor: "E91E63"),
            StoryMusicTrack(title: "Ocean Waves", artist: "Ambient", duration: 300, artworkColor: "3498DB"),
            StoryMusicTrack(title: "Retro Funk", artist: "Disco", duration: 225, artworkColor: "FF7F50"),
        ]
    }

    private var filteredTracks: [StoryMusicTrack] {
        guard !searchText.isEmpty else { return sampleTracks }
        return sampleTracks.filter {
            $0.title.localizedCaseInsensitiveContains(searchText) ||
            $0.artist.localizedCaseInsensitiveContains(searchText)
        }
    }

    public var body: some View {
        VStack(spacing: 0) {
            searchBar
            trackList

            if selectedTrack != nil {
                trimControl
            }
        }
        .background(Color.black.opacity(0.5))
        .cornerRadius(20, corners: [.topLeft, .topRight])
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.white.opacity(0.4))

            TextField("Search music...", text: $searchText)
                .font(.system(size: 15))
                .foregroundColor(.white)

            if !searchText.isEmpty {
                Button { searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.white.opacity(0.4))
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.white.opacity(0.08))
        )
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Track List

    private var trackList: some View {
        ScrollView {
            LazyVStack(spacing: 2) {
                ForEach(filteredTracks) { track in
                    trackRow(track)
                }
            }
            .padding(.horizontal, 8)
        }
        .frame(maxHeight: 240)
    }

    private func trackRow(_ track: StoryMusicTrack) -> some View {
        let isSelected = selectedTrack?.id == track.id
        return Button {
            withAnimation(.spring(response: 0.25)) {
                selectedTrack = isSelected ? nil : track
                trimStart = 0
                trimEnd = min(15, track.duration)
            }
            HapticFeedback.medium()
        } label: {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(hex: track.artworkColor))
                    .frame(width: 44, height: 44)
                    .overlay(
                        Image(systemName: isSelected ? "pause.fill" : "music.note")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.white)
                    )

                VStack(alignment: .leading, spacing: 2) {
                    Text(track.title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(isSelected ? Color(hex: "FF2E63") : .white)
                        .lineLimit(1)
                    Text(track.artist)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                        .lineLimit(1)
                }

                Spacer()

                Text(formatDuration(track.duration))
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(.white.opacity(0.4))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? Color(hex: "FF2E63").opacity(0.12) : Color.clear)
            )
        }
    }

    // MARK: - Trim Control

    private var trimControl: some View {
        VStack(spacing: 8) {
            HStack {
                Text("Trim")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white.opacity(0.7))
                Spacer()
                Text("\(formatDuration(trimStart)) - \(formatDuration(trimEnd))")
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(Color(hex: "08D9D6"))
            }

            GeometryReader { geo in
                let maxDuration = selectedTrack?.duration ?? 30
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.white.opacity(0.1))
                        .frame(height: 6)

                    let startFraction = trimStart / maxDuration
                    let endFraction = trimEnd / maxDuration
                    let startX = startFraction * geo.size.width
                    let width = max(0, (endFraction - startFraction) * geo.size.width)

                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(hex: "FF2E63"))
                        .frame(width: width, height: 6)
                        .offset(x: startX)
                }
                .frame(height: 6)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            let maxDuration = selectedTrack?.duration ?? 30
                            let fraction = value.location.x / geo.size.width
                            let time = max(0, min(maxDuration, fraction * maxDuration))
                            let clipLength = min(15.0, maxDuration)
                            trimStart = max(0, min(time, maxDuration - clipLength))
                            trimEnd = min(maxDuration, trimStart + clipLength)
                        }
                )
            }
            .frame(height: 24)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.white.opacity(0.05))
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}
