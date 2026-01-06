//
//  SceneDelegate.swift
//  Meeshy
//
//  Scene delegate for app lifecycle management including screenshot protection
//  iOS 17+
//

import UIKit
import SwiftUI

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?
    private var securityBlurView: UIVisualEffectView?
    private weak var currentWindowScene: UIWindowScene?

    // MARK: - Scene Lifecycle

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // Store reference to window scene for later use
        guard let windowScene = scene as? UIWindowScene else { return }
        self.currentWindowScene = windowScene

        // Setup screen capture notifications
        setupScreenCaptureNotifications()
    }

    func sceneWillResignActive(_ scene: UIScene) {
        // App is about to become inactive (screenshot, task switcher, notification center)
        addSecurityBlur(to: scene)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        // App is active again
        removeSecurityBlur()
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        // Transitioning from background to foreground
        removeSecurityBlur()
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        // App entered background - ensure blur is applied
        addSecurityBlur(to: scene)
    }

    // MARK: - Security: Screenshot/Recording Protection

    /// Add a blur effect to hide sensitive content when app is in background or task switcher
    private func addSecurityBlur(to scene: UIScene) {
        // Get window from the scene (works with SwiftUI apps)
        guard let windowScene = scene as? UIWindowScene,
              let window = windowScene.windows.first,
              securityBlurView == nil else { return }

        // Create blur effect
        let blurEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        let blurView = UIVisualEffectView(effect: blurEffect)
        blurView.frame = window.bounds
        blurView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        blurView.tag = 999 // Unique tag for identification

        // Add Meeshy logo/branding on top of blur
        let logoContainer = UIView()
        logoContainer.translatesAutoresizingMaskIntoConstraints = false
        blurView.contentView.addSubview(logoContainer)

        // Logo image (using SF Symbol as placeholder)
        let logoImageView = UIImageView()
        logoImageView.image = UIImage(systemName: "message.fill")
        logoImageView.tintColor = UIColor(named: "MeeshyPrimary") ?? .systemBlue
        logoImageView.contentMode = .scaleAspectFit
        logoImageView.translatesAutoresizingMaskIntoConstraints = false
        logoContainer.addSubview(logoImageView)

        // App name label
        let nameLabel = UILabel()
        nameLabel.text = "Meeshy"
        nameLabel.font = UIFont.systemFont(ofSize: 28, weight: .bold)
        nameLabel.textColor = UIColor(named: "MeeshyPrimary") ?? .systemBlue
        nameLabel.translatesAutoresizingMaskIntoConstraints = false
        logoContainer.addSubview(nameLabel)

        NSLayoutConstraint.activate([
            logoContainer.centerXAnchor.constraint(equalTo: blurView.contentView.centerXAnchor),
            logoContainer.centerYAnchor.constraint(equalTo: blurView.contentView.centerYAnchor),

            logoImageView.topAnchor.constraint(equalTo: logoContainer.topAnchor),
            logoImageView.centerXAnchor.constraint(equalTo: logoContainer.centerXAnchor),
            logoImageView.widthAnchor.constraint(equalToConstant: 80),
            logoImageView.heightAnchor.constraint(equalToConstant: 80),

            nameLabel.topAnchor.constraint(equalTo: logoImageView.bottomAnchor, constant: 16),
            nameLabel.centerXAnchor.constraint(equalTo: logoContainer.centerXAnchor),
            nameLabel.bottomAnchor.constraint(equalTo: logoContainer.bottomAnchor)
        ])

        // Add to window with animation
        blurView.alpha = 0
        window.addSubview(blurView)

        UIView.animate(withDuration: 0.15) {
            blurView.alpha = 1
        }

        securityBlurView = blurView
        securityLogger.info("Security blur added - protecting sensitive content")
    }

    /// Remove the security blur when app becomes active
    private func removeSecurityBlur() {
        guard let blurView = securityBlurView else { return }

        UIView.animate(withDuration: 0.2) {
            blurView.alpha = 0
        } completion: { [weak self] _ in
            blurView.removeFromSuperview()
            self?.securityBlurView = nil
        }

        securityLogger.info("Security blur removed")
    }
}

// MARK: - Additional Security Extensions

extension SceneDelegate {

    /// Prevent screen recording detection (iOS 11+)
    func setupScreenCaptureNotifications() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenCaptureDidChange),
            name: UIScreen.capturedDidChangeNotification,
            object: nil
        )
    }

    @objc private func screenCaptureDidChange() {
        guard let scene = currentWindowScene else { return }

        if UIScreen.main.isCaptured {
            // Screen is being recorded or mirrored
            addSecurityBlur(to: scene)
            securityLogger.warn("Screen capture detected - content hidden")

            // Optionally notify the user
            NotificationCenter.default.post(
                name: Notification.Name("ScreenCaptureDetected"),
                object: nil
            )
        } else {
            removeSecurityBlur()
        }
    }
}
