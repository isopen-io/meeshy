//
//  HorizontalOnlyScrollView.swift
//  Meeshy
//
//  UIKit-backed horizontal scroll view that completely disables vertical scrolling.
//  Use this when SwiftUI's ScrollView(.horizontal) still allows vertical bounce.
//

import SwiftUI
import UIKit

// MARK: - Horizontal Only ScrollView

struct HorizontalOnlyScrollView<Content: View>: UIViewRepresentable {
    let content: Content
    let height: CGFloat

    init(height: CGFloat = 36, @ViewBuilder content: () -> Content) {
        self.height = height
        self.content = content()
    }

    func makeUIView(context: Context) -> UIScrollView {
        let scrollView = UIScrollView()
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.showsVerticalScrollIndicator = false
        scrollView.alwaysBounceHorizontal = true
        scrollView.alwaysBounceVertical = false
        scrollView.isDirectionalLockEnabled = true
        scrollView.contentInsetAdjustmentBehavior = .never
        // FIX: Allow content to overflow (for scale effects and shadows)
        scrollView.clipsToBounds = false

        // Host the SwiftUI content
        let hostingController = UIHostingController(rootView: content)
        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        hostingController.view.backgroundColor = .clear
        // FIX: Allow content to overflow in hosting view as well
        hostingController.view.clipsToBounds = false

        scrollView.addSubview(hostingController.view)

        // Store hosting controller in context
        context.coordinator.hostingController = hostingController

        NSLayoutConstraint.activate([
            hostingController.view.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor),
            hostingController.view.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
            // Fix height to content size
            hostingController.view.heightAnchor.constraint(equalToConstant: height),
            // Fix scroll view frame height to match content
            scrollView.frameLayoutGuide.heightAnchor.constraint(equalToConstant: height)
        ])

        return scrollView
    }

    func updateUIView(_ scrollView: UIScrollView, context: Context) {
        context.coordinator.hostingController?.rootView = content
        // Update height constraint if needed
        if let hostingView = scrollView.subviews.first {
            for constraint in hostingView.constraints where constraint.firstAttribute == .height {
                constraint.constant = height
            }
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    class Coordinator {
        var hostingController: UIHostingController<Content>?
    }
}

// MARK: - View Extension

extension View {
    func horizontalScrollOnly(height: CGFloat = 36) -> some View {
        HorizontalOnlyScrollView(height: height) {
            self
        }
    }
}
