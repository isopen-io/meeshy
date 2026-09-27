//
//  CameraZoomController.swift
//  Meeshy
//
//  #8441 — relie le pincement sur sa propre image à la caméra envoyée.
//  L'état (profil, facteur affiché) vit sur le MainActor pour la vue ;
//  l'écriture dans l'appareil (`lockForConfiguration` + rampe) part sur une
//  file série dédiée : le geste ne bloque jamais le thread principal.
//

import CoreGraphics
import Foundation

/// La caméra, vue par le zoom. Implémentée par `CaptureDeviceZoomTarget`
/// (AVFoundation) et doublée dans les tests.
nonisolated protocol ZoomableCaptureDevice: AnyObject, Sendable {
    var zoomDescriptor: CameraZoomDescriptor { get }
    /// `rampRate == nil` : saut immédiat (ouverture, changement de caméra).
    func applyZoom(deviceFactor: CGFloat, rampRate: Float?)
}

/// Où s'exécute l'écriture dans l'appareil.
nonisolated protocol CameraZoomApplying: Sendable {
    func apply(_ work: @escaping @Sendable () -> Void)
}

nonisolated struct CameraZoomQueue: CameraZoomApplying {
    private let queue = DispatchQueue(label: "me.meeshy.call.camera-zoom", qos: .userInteractive)

    func apply(_ work: @escaping @Sendable () -> Void) {
        queue.async(execute: work)
    }
}

@MainActor
protocol CameraZoomProviding: AnyObject {
    var profile: CameraZoomProfile? { get }
    var displayFactor: CGFloat { get }
    var isPinching: Bool { get }
    func attach(_ device: any ZoomableCaptureDevice)
    func detach()
    func updatePinch(scale: CGFloat)
    func endPinch()
    func resetToBaseline()
    func step(_ step: CameraZoomStep)
}

@MainActor
final class CameraZoomController: ObservableObject, CameraZoomProviding {
    /// Une seule capture caméra d'appel vit dans le process à la fois
    /// (`P2PWebRTCClient`), comme `PiPCallController.shared`.
    static let shared = CameraZoomController()

    @Published private(set) var profile: CameraZoomProfile?
    @Published private(set) var displayFactor: CGFloat = 1
    @Published private(set) var isPinching = false

    private var device: (any ZoomableCaptureDevice)?
    private var pinchStart: CGFloat?
    private let applier: any CameraZoomApplying

    init(applier: any CameraZoomApplying = CameraZoomQueue()) {
        self.applier = applier
    }

    /// Appelé après chaque `startCapture` réussi : une nouvelle caméra repart à 1×.
    func attach(_ device: any ZoomableCaptureDevice) {
        self.device = device
        pinchStart = nil
        isPinching = false
        profile = CameraZoomPolicy.profile(for: device.zoomDescriptor)
        guard let profile else {
            displayFactor = 1
            return
        }
        move(to: profile.baselineDisplay, rampRate: nil)
    }

    func detach() {
        device = nil
        profile = nil
        pinchStart = nil
        isPinching = false
        displayFactor = 1
    }

    func updatePinch(scale: CGFloat) {
        guard let profile else { return }
        let start = pinchStart ?? displayFactor
        pinchStart = start
        isPinching = true
        move(to: profile.display(forPinchScale: scale, from: start), rampRate: CameraZoomPolicy.pinchRampRate)
    }

    func endPinch() {
        pinchStart = nil
        isPinching = false
        guard let profile else { return }
        move(to: profile.settled(displayFactor), rampRate: CameraZoomPolicy.settleRampRate)
    }

    func resetToBaseline() {
        guard let profile else { return }
        move(to: profile.baselineDisplay, rampRate: CameraZoomPolicy.settleRampRate)
    }

    func step(_ step: CameraZoomStep) {
        guard let profile else { return }
        move(to: profile.stepped(from: displayFactor, step), rampRate: CameraZoomPolicy.settleRampRate)
    }

    private func move(to display: CGFloat, rampRate: Float?) {
        guard let profile, let device else { return }
        let clamped = profile.clampedDisplay(display)
        displayFactor = clamped
        let deviceFactor = profile.deviceFactor(forDisplay: clamped)
        applier.apply { device.applyZoom(deviceFactor: deviceFactor, rampRate: rampRate) }
    }
}
