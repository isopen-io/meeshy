//
//  WebRTCVideoView.swift
//  Meeshy
//
//  SwiftUI wrapper for WebRTC video rendering
//  Uses RTCMTLVideoView for Metal-accelerated video display
//

import SwiftUI
#if canImport(WebRTC)
import WebRTC
#endif

// MARK: - WebRTC Video View

/// SwiftUI wrapper for RTCMTLVideoView to render WebRTC video tracks
struct WebRTCVideoView: UIViewRepresentable {

    // MARK: - Properties

    /// The video track to render (local or remote)
    let track: RTCVideoTrack?

    /// Content mode for video scaling
    var contentMode: UIView.ContentMode = .scaleAspectFill

    /// Mirror the video (typically for local front camera)
    var isMirrored: Bool = false

    /// Rotation override (nil uses default)
    var rotationOverride: RTCVideoRotation? = nil

    // MARK: - UIViewRepresentable

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let videoView = RTCMTLVideoView(frame: .zero)
        videoView.contentMode = contentMode
        videoView.clipsToBounds = true
        videoView.backgroundColor = .black

        // Set video content mode
        #if arch(arm64)
        // Metal view specific settings
        videoView.videoContentMode = contentMode == .scaleAspectFill ? .scaleAspectFill : .scaleAspectFit
        #endif

        // Apply mirroring for front camera
        if isMirrored {
            videoView.transform = CGAffineTransform(scaleX: -1, y: 1)
        }

        return videoView
    }

    func updateUIView(_ uiView: RTCMTLVideoView, context: Context) {
        // Remove from previous track if different
        if let currentTrack = context.coordinator.currentTrack,
           currentTrack.trackId != track?.trackId {
            currentTrack.remove(uiView)
        }

        // Add to new track
        if let track = track {
            track.add(uiView)
            context.coordinator.currentTrack = track
        } else {
            context.coordinator.currentTrack = nil
        }

        // Update content mode
        uiView.contentMode = contentMode
        #if arch(arm64)
        uiView.videoContentMode = contentMode == .scaleAspectFill ? .scaleAspectFill : .scaleAspectFit
        #endif

        // Update mirroring
        if isMirrored {
            uiView.transform = CGAffineTransform(scaleX: -1, y: 1)
        } else {
            uiView.transform = .identity
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    static func dismantleUIView(_ uiView: RTCMTLVideoView, coordinator: Coordinator) {
        // Clean up: remove view from track when view is destroyed
        coordinator.currentTrack?.remove(uiView)
        coordinator.currentTrack = nil
    }

    // MARK: - Coordinator

    class Coordinator {
        var currentTrack: RTCVideoTrack?
    }
}

// MARK: - Video Container View

/// Container view with rounded corners and optional overlay
struct VideoContainerView: View {
    let track: RTCVideoTrack?
    var isMirrored: Bool = false
    var cornerRadius: CGFloat = 12
    var showPlaceholder: Bool = true
    var placeholderIcon: String = "video.slash.fill"

    var body: some View {
        ZStack {
            // Video view
            if track != nil {
                WebRTCVideoView(
                    track: track,
                    contentMode: .scaleAspectFill,
                    isMirrored: isMirrored
                )
            } else if showPlaceholder {
                // Placeholder when no video
                Rectangle()
                    .fill(Color.black.opacity(0.8))
                    .overlay(
                        Image(systemName: placeholderIcon)
                            .font(.system(size: 40))
                            .foregroundColor(.white.opacity(0.5))
                    )
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
    }
}

// MARK: - Local Video Preview

/// Draggable local video preview overlay
struct LocalVideoPreviewView: View {
    let track: RTCVideoTrack?
    let isFrontCamera: Bool

    @State private var position: CGPoint = CGPoint(x: UIScreen.main.bounds.width - 80, y: 100)
    @State private var isDragging = false

    private let previewSize: CGSize = CGSize(width: 120, height: 160)

    var body: some View {
        GeometryReader { geometry in
            VideoContainerView(
                track: track,
                isMirrored: isFrontCamera,
                cornerRadius: 12,
                showPlaceholder: true,
                placeholderIcon: "person.fill"
            )
            .frame(width: previewSize.width, height: previewSize.height)
            .shadow(color: .black.opacity(0.3), radius: 8, x: 0, y: 4)
            .position(position)
            .gesture(
                DragGesture()
                    .onChanged { value in
                        isDragging = true
                        // Constrain to screen bounds with padding
                        let padding: CGFloat = 20
                        let newX = min(max(previewSize.width/2 + padding, value.location.x),
                                      geometry.size.width - previewSize.width/2 - padding)
                        let newY = min(max(previewSize.height/2 + padding, value.location.y),
                                      geometry.size.height - previewSize.height/2 - padding)
                        position = CGPoint(x: newX, y: newY)
                    }
                    .onEnded { _ in
                        isDragging = false
                        // Snap to nearest corner
                        withAnimation(.spring(response: 0.3)) {
                            snapToCorner(in: geometry.size)
                        }
                    }
            )
            .scaleEffect(isDragging ? 1.05 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: isDragging)
            .onAppear {
                // Initial position: top-right corner
                position = CGPoint(
                    x: geometry.size.width - previewSize.width/2 - 20,
                    y: previewSize.height/2 + 60
                )
            }
        }
    }

    private func snapToCorner(in size: CGSize) {
        let padding: CGFloat = 20
        let corners = [
            CGPoint(x: previewSize.width/2 + padding, y: previewSize.height/2 + 60), // Top-left
            CGPoint(x: size.width - previewSize.width/2 - padding, y: previewSize.height/2 + 60), // Top-right
            CGPoint(x: previewSize.width/2 + padding, y: size.height - previewSize.height/2 - 100), // Bottom-left
            CGPoint(x: size.width - previewSize.width/2 - padding, y: size.height - previewSize.height/2 - 100) // Bottom-right
        ]

        // Find nearest corner
        var nearestCorner = corners[0]
        var minDistance = CGFloat.infinity

        for corner in corners {
            let distance = hypot(position.x - corner.x, position.y - corner.y)
            if distance < minDistance {
                minDistance = distance
                nearestCorner = corner
            }
        }

        position = nearestCorner
    }
}

// MARK: - Preview

#if DEBUG
struct WebRTCVideoView_Previews: PreviewProvider {
    static var previews: some View {
        ZStack {
            // Remote video (full screen)
            VideoContainerView(
                track: nil,
                cornerRadius: 0,
                placeholderIcon: "video.slash.fill"
            )
            .ignoresSafeArea()

            // Local video preview
            LocalVideoPreviewView(
                track: nil,
                isFrontCamera: true
            )
        }
        .preferredColorScheme(.dark)
    }
}
#endif
