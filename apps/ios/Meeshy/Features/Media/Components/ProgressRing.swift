//
//  ProgressRing.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI

struct ProgressRing: View {
    let progress: Double
    var lineWidth: CGFloat = 4
    var color: Color = .blue

    var body: some View {
        ZStack {
            // Background circle
            Circle()
                .stroke(color.opacity(0.2), lineWidth: lineWidth)

            // Progress circle
            Circle()
                .trim(from: 0, to: progress)
                .stroke(
                    color,
                    style: StrokeStyle(
                        lineWidth: lineWidth,
                        lineCap: .round
                    )
                )
                .rotationEffect(.degrees(-90))
                .animation(.linear, value: progress)
        }
    }
}

// MARK: - Progress Ring with Percentage

struct ProgressRingWithPercentage: View {
    let progress: Double
    var size: CGFloat = 60
    var lineWidth: CGFloat = 4
    var color: Color = .blue

    var body: some View {
        ZStack {
            ProgressRing(progress: progress, lineWidth: lineWidth, color: color)

            Text("\(Int(progress * 100))%")
                .font(.system(size: size * 0.25, weight: .semibold))
                .foregroundColor(color)
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Indeterminate Progress Ring

struct IndeterminateProgressRing: View {
    @State private var isRotating = false
    var size: CGFloat = 40
    var lineWidth: CGFloat = 4
    var color: Color = .blue

    var body: some View {
        Circle()
            .trim(from: 0, to: 0.7)
            .stroke(
                color,
                style: StrokeStyle(
                    lineWidth: lineWidth,
                    lineCap: .round
                )
            )
            .frame(width: size, height: size)
            .rotationEffect(.degrees(isRotating ? 360 : 0))
            .animation(.linear(duration: 1).repeatForever(autoreverses: false), value: isRotating)
            .onAppear {
                isRotating = true
            }
    }
}

// MARK: - Upload Progress View

struct UploadProgressView: View {
    let progress: Double
    let onCancel: () -> Void

    var body: some View {
        ZStack {
            // Progress ring
            ProgressRing(progress: progress, lineWidth: 3, color: .blue)
                .frame(width: 36, height: 36)

            // Cancel button
            Button {
                onCancel()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
            }
        }
        .frame(width: 40, height: 40)
        .background(Color.black.opacity(0.6))
        .clipShape(Circle())
    }
}
