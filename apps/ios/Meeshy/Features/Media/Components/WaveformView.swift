//
//  WaveformView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI

struct WaveformView: View {
    let levels: [CGFloat]
    var color: Color = .blue
    var spacing: CGFloat = 3

    var body: some View {
        HStack(alignment: .center, spacing: spacing) {
            ForEach(Array(levels.enumerated()), id: \.offset) { index, level in
                RoundedRectangle(cornerRadius: 2)
                    .fill(color)
                    .frame(width: barWidth, height: max(level * maxHeight, 4))
                    .animation(.easeInOut(duration: 0.1), value: level)
            }
        }
    }

    private var barWidth: CGFloat {
        3
    }

    private var maxHeight: CGFloat {
        40
    }
}

// MARK: - Animated Waveform

struct AnimatedWaveformView: View {
    @State private var levels: [CGFloat] = Array(repeating: 0.3, count: 20)
    var isAnimating: Bool = true

    // MEMORY FIX: Store timer reference for proper cleanup
    @State private var animationTimer: Timer?

    var body: some View {
        WaveformView(levels: levels)
            .onAppear {
                if isAnimating {
                    startAnimation()
                }
            }
            // MEMORY FIX: Invalidate timer when view disappears
            .onDisappear {
                animationTimer?.invalidate()
                animationTimer = nil
            }
            // MEMORY FIX: Handle isAnimating changes
            .onChange(of: isAnimating) { _, newValue in
                if newValue {
                    startAnimation()
                } else {
                    animationTimer?.invalidate()
                    animationTimer = nil
                }
            }
    }

    private func startAnimation() {
        // MEMORY FIX: Invalidate any existing timer first
        animationTimer?.invalidate()

        // MEMORY FIX: Store timer reference
        animationTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
            guard isAnimating else {
                animationTimer?.invalidate()
                animationTimer = nil
                return
            }

            withAnimation {
                levels = levels.map { _ in CGFloat.random(in: 0.2...1.0) }
            }
        }
    }
}
