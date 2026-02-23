import SwiftUI
import AVKit
import MeeshyUI

struct VideoPreviewView: View {
    let url: URL
    let onAccept: () -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var player: AVPlayer?
    @State private var duration: String = "0:00"

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let player {
                VideoPlayer(player: player)
                    .ignoresSafeArea()
            }

            VStack {
                HStack {
                    Button { dismiss() } label: {
                        Text("Annuler")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(.white.opacity(0.2)))
                    }

                    Spacer()

                    Text(duration)
                        .font(.system(size: 13, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(.black.opacity(0.5)))
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)

                Spacer()

                Button {
                    onAccept()
                    HapticFeedback.success()
                    dismiss()
                } label: {
                    Text("Utiliser la video")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            RoundedRectangle(cornerRadius: 14)
                                .fill(
                                    LinearGradient(
                                        colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B")],
                                        startPoint: .leading, endPoint: .trailing
                                    )
                                )
                                .shadow(color: Color(hex: "FF2E63").opacity(0.4), radius: 8, y: 4)
                        )
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 30)
            }
        }
        .onAppear {
            let avPlayer = AVPlayer(url: url)
            player = avPlayer
            avPlayer.play()
            loadDuration()
        }
        .onDisappear {
            player?.pause()
            player = nil
        }
    }

    private func loadDuration() {
        Task {
            let asset = AVURLAsset(url: url)
            if let dur = try? await asset.load(.duration) {
                let seconds = CMTimeGetSeconds(dur)
                let m = Int(seconds) / 60
                let s = Int(seconds) % 60
                await MainActor.run {
                    duration = String(format: "%d:%02d", m, s)
                }
            }
        }
    }
}
