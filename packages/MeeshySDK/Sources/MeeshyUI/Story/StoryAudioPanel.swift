import SwiftUI
import MeeshySDK
import AVFoundation

// MARK: - Audio Panel Tab

private enum AudioPanelTab: String, CaseIterable {
    case library = "Bibliothèque"
    case record = "Enregistrer"
}

// MARK: - Audio Item Model

private struct AudioItem: Identifiable, Decodable {
    let id: String
    let title: String
    let duration: Int
    let fileUrl: String
    let usageCount: Int
    let uploaderName: String?

    enum CodingKeys: String, CodingKey {
        case id, title, duration, fileUrl, usageCount
        case uploaderName = "uploader"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        duration = try c.decode(Int.self, forKey: .duration)
        fileUrl = try c.decode(String.self, forKey: .fileUrl)
        usageCount = (try? c.decode(Int.self, forKey: .usageCount)) ?? 0
        // uploader is an object { username: String }
        if let uploaderObj = try? c.nestedContainer(keyedBy: UploaderKeys.self, forKey: .uploaderName) {
            uploaderName = try? uploaderObj.decode(String.self, forKey: .username)
        } else {
            uploaderName = nil
        }
    }

    private enum UploaderKeys: String, CodingKey { case username }
}

// MARK: - Story Audio Panel

public struct StoryAudioPanel: View {
    @Binding var selectedAudioId: String?
    @Binding var selectedAudioTitle: String?
    @Binding var audioVolume: Float

    @State private var activeTab: AudioPanelTab = .library
    @State private var searchQuery = ""
    @State private var items: [AudioItem] = []
    @State private var isLoading = false
    @State private var previewingId: String?
    @State private var previewPlayer: AudioPlayerManager = AudioPlayerManager()

    public init(selectedAudioId: Binding<String?>, selectedAudioTitle: Binding<String?>, audioVolume: Binding<Float>) {
        _selectedAudioId = selectedAudioId
        _selectedAudioTitle = selectedAudioTitle
        _audioVolume = audioVolume
    }

    public var body: some View {
        VStack(spacing: 0) {
            tabSelector
            tabContent
        }
        .frame(maxHeight: 320)
        .background(Color.black.opacity(0.5))
        .onAppear { fetchLibrary() }
        .onDisappear { previewPlayer.stop() }
    }

    // MARK: - Tab Selector

    private var tabSelector: some View {
        HStack(spacing: 0) {
            ForEach(AudioPanelTab.allCases, id: \.self) { tab in
                Button {
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                        activeTab = tab
                    }
                } label: {
                    Text(tab.rawValue)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(activeTab == tab ? .white : .white.opacity(0.45))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .overlay(alignment: .bottom) {
                            if activeTab == tab {
                                Capsule()
                                    .fill(Color(hex: "FF2E63"))
                                    .frame(height: 2)
                                    .padding(.horizontal, 20)
                                    .transition(.opacity)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 4)
        .overlay(alignment: .bottom) {
            Divider().opacity(0.2)
        }
    }

    // MARK: - Tab Content

    @ViewBuilder
    private var tabContent: some View {
        switch activeTab {
        case .library:
            libraryTab
        case .record:
            StoryVoiceRecorder(
                onRecordComplete: { url in
                    selectedAudioId = url.lastPathComponent
                    selectedAudioTitle = "Enregistrement"
                    previewPlayer.stop()
                }
            )
        }
    }

    // MARK: - Library Tab

    private var libraryTab: some View {
        VStack(spacing: 0) {
            searchBar

            if selectedAudioId != nil {
                volumeRow
            }

            if isLoading {
                ProgressView()
                    .tint(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if items.isEmpty {
                Text("Aucun son disponible")
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.4))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        if selectedAudioId != nil {
                            noAudioRow
                        }
                        ForEach(filteredItems) { item in
                            audioRow(item)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.white.opacity(0.4))
            TextField("", text: $searchQuery, prompt: Text("Rechercher un son...").foregroundColor(.white.opacity(0.3)))
                .font(.system(size: 13))
                .foregroundColor(.white)
                .submitLabel(.search)
                .onSubmit { fetchLibrary(query: searchQuery) }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.08)))
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }

    private var volumeRow: some View {
        HStack(spacing: 10) {
            Image(systemName: "speaker.wave.1.fill")
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.5))
            Slider(value: $audioVolume, in: 0...1)
                .tint(Color(hex: "FF2E63"))
            Image(systemName: "speaker.wave.3.fill")
                .font(.system(size: 12))
                .foregroundColor(.white.opacity(0.5))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }

    private var noAudioRow: some View {
        Button {
            selectedAudioId = nil
            selectedAudioTitle = nil
            previewPlayer.stop()
            previewingId = nil
            HapticFeedback.light()
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.08))
                        .frame(width: 36, height: 36)
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white.opacity(0.6))
                }
                Text("Aucun son")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.6))
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
    }

    private func audioRow(_ item: AudioItem) -> some View {
        let isSelected = selectedAudioId == item.id
        let isPreviewing = previewingId == item.id

        return Button {
            selectAudio(item)
        } label: {
            HStack(spacing: 12) {
                // Play/pause preview
                Button {
                    togglePreview(item)
                } label: {
                    ZStack {
                        Circle()
                            .fill(isSelected ? Color(hex: "FF2E63") : Color.white.opacity(0.1))
                            .frame(width: 36, height: 36)
                        Image(systemName: isPreviewing ? "pause.fill" : "play.fill")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(isSelected ? .white : .white.opacity(0.7))
                    }
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(isSelected ? Color(hex: "FF2E63") : .white)
                        .lineLimit(1)
                    HStack(spacing: 4) {
                        if let uploader = item.uploaderName {
                            Text(uploader)
                                .font(.system(size: 11))
                                .foregroundColor(.white.opacity(0.4))
                        }
                        Text(formatDuration(item.duration))
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.white.opacity(0.35))
                    }
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(Color(hex: "FF2E63"))
                        .font(.system(size: 16))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
            .background(isSelected ? Color(hex: "FF2E63").opacity(0.08) : Color.clear)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Computed

    private var filteredItems: [AudioItem] {
        guard !searchQuery.isEmpty else { return items }
        return items.filter { $0.title.localizedCaseInsensitiveContains(searchQuery) }
    }

    // MARK: - Actions

    private func selectAudio(_ item: AudioItem) {
        HapticFeedback.light()
        if selectedAudioId == item.id {
            selectedAudioId = nil
            selectedAudioTitle = nil
        } else {
            selectedAudioId = item.id
            selectedAudioTitle = item.title
        }
    }

    private func togglePreview(_ item: AudioItem) {
        if previewingId == item.id {
            previewPlayer.stop()
            previewingId = nil
        } else {
            previewPlayer.stop()
            previewingId = item.id
            let baseURL = APIClient.shared.baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            let url = item.fileUrl.hasPrefix("http") ? item.fileUrl : "\(baseURL)\(item.fileUrl)"
            previewPlayer.play(urlString: url)
        }
    }

    private func fetchLibrary(query: String? = nil) {
        isLoading = true
        Task {
            var queryItems: [URLQueryItem]? = nil
            if let q = query, !q.isEmpty {
                queryItems = [URLQueryItem(name: "q", value: q)]
            }
            let result: APIResponse<[AudioItem]>? = try? await APIClient.shared.request(
                endpoint: "/stories/audio",
                queryItems: queryItems
            )
            await MainActor.run {
                items = result?.data ?? []
                isLoading = false
            }
        }
    }

    private func formatDuration(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return String(format: "%d:%02d", m, s)
    }
}
