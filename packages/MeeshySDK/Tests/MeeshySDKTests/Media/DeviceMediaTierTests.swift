import Foundation
import Testing
@testable import MeeshySDK

/// **Chaque iPhone connaît son tier média (#11281)** — la loi PURE qui range un
/// appareil en bas / moyen / haut / pro depuis ce qu'il déclare : identifiant
/// matériel (`utsname.machine`), mémoire physique, cadence maximale de l'écran,
/// décodage matériel HEVC et AV1.
///
/// Les vecteurs ci-dessous sont ceux que la jumelle web
/// (`apps/web/src/lib/device/capability-tier.ts`, lot W11) rejoue : mêmes
/// paliers, mêmes seuils. Les mémoires sont celles que `ProcessInfo` RAPPORTE
/// (un « 4 Go » rend ~3,7 Gio), jamais les chiffres du fabricant.
@Suite("DeviceMediaTier — le tier média d'un appareil")
struct DeviceMediaTierTests {

    typealias Signals = DeviceMediaSignals

    static func signals(
        _ machine: String,
        gib: Double,
        fps: Int = 60,
        hevc: Bool = true,
        av1: Bool = false
    ) -> Signals {
        Signals(
            machine: machine,
            physicalMemory: UInt64(gib * 1_073_741_824),
            maximumFramesPerSecond: fps,
            hardwareDecodesHEVC: hevc,
            hardwareDecodesAV1: av1
        )
    }

    // MARK: - Les paliers, appareil par appareil

    struct Vector: Sendable, CustomTestStringConvertible {
        let name: String
        let signals: Signals
        let expected: DeviceMediaTier
        var testDescription: String { "\(name) → \(expected)" }
    }

    static let vectors: [Vector] = [
        Vector(name: "iPhone 8 (A11, 2 Go)", signals: signals("iPhone10,1", gib: 1.875), expected: .low),
        Vector(name: "iPhone X (A11, 3 Go)", signals: signals("iPhone10,6", gib: 2.8), expected: .mid),
        Vector(name: "iPhone XR (A12, 3 Go)", signals: signals("iPhone11,8", gib: 2.8), expected: .mid),
        Vector(name: "iPhone 11 (A13, 4 Go)", signals: signals("iPhone12,1", gib: 3.7), expected: .mid),
        Vector(name: "iPhone 12 (A14, 4 Go)", signals: signals("iPhone13,2", gib: 3.7), expected: .mid),
        Vector(name: "iPhone 13 (A15, 4 Go)", signals: signals("iPhone14,5", gib: 3.7), expected: .high),
        Vector(name: "iPhone 13 Pro (A15, 6 Go, 120 Hz)", signals: signals("iPhone14,2", gib: 5.6, fps: 120), expected: .high),
        Vector(name: "iPhone 14 Pro (A16, 6 Go, 120 Hz)", signals: signals("iPhone15,2", gib: 5.6, fps: 120), expected: .high),
        Vector(name: "iPhone 15 (A16, 6 Go, 60 Hz)", signals: signals("iPhone15,4", gib: 5.6), expected: .high),
        Vector(name: "iPhone 15 Pro (A17 Pro, AV1, 120 Hz)", signals: signals("iPhone16,1", gib: 7.5, fps: 120, av1: true), expected: .pro),
        Vector(name: "iPhone 16 (A18, AV1, 60 Hz)", signals: signals("iPhone17,3", gib: 7.5, av1: true), expected: .high),
        Vector(name: "iPhone 16 Pro (A18 Pro, AV1, 120 Hz)", signals: signals("iPhone17,1", gib: 7.5, fps: 120, av1: true), expected: .pro),
        Vector(name: "iPhone 17 Pro (A19 Pro, AV1, 120 Hz)", signals: signals("iPhone18,1", gib: 11.5, fps: 120, av1: true), expected: .pro),
        Vector(name: "iPhone à venir, identifiant inconnu", signals: signals("iPhone99,1", gib: 11.5, fps: 120, av1: true), expected: .pro),
        Vector(name: "iPad 7e génération (A10 Fusion, 3 Go)", signals: signals("iPad7,11", gib: 2.8), expected: .mid),
        Vector(name: "iPad 8e génération (A12, 3 Go)", signals: signals("iPad11,6", gib: 2.8), expected: .mid),
        Vector(name: "iPad 9e génération (A13, 3 Go)", signals: signals("iPad12,1", gib: 2.8), expected: .mid),
        Vector(name: "iPad 10e génération (A14, 4 Go)", signals: signals("iPad13,18", gib: 3.7), expected: .mid),
        Vector(name: "iPad mini 6 (A15, 4 Go)", signals: signals("iPad14,1", gib: 3.7), expected: .high),
        Vector(name: "iPad Air 5 (M1, 8 Go)", signals: signals("iPad13,16", gib: 7.5), expected: .high),
        Vector(name: "iPad Pro M1 (16 Go, 120 Hz)", signals: signals("iPad13,8", gib: 15.5, fps: 120), expected: .high),
        Vector(name: "iPad Pro M2 (8 Go, 120 Hz)", signals: signals("iPad14,3", gib: 7.5, fps: 120), expected: .high),
        Vector(name: "iPad Air M3 (8 Go, AV1, 60 Hz)", signals: signals("iPad15,3", gib: 7.5, av1: true), expected: .high),
        Vector(name: "iPad Pro M4 (AV1, 120 Hz)", signals: signals("iPad16,3", gib: 7.5, fps: 120, av1: true), expected: .pro),
        Vector(name: "iPad Pro M5 (AV1, 120 Hz)", signals: signals("iPad17,1", gib: 11.5, fps: 120, av1: true), expected: .pro),
    ]

    @Test("chaque appareil du parc tombe dans son tier", arguments: DeviceMediaTierTests.vectors)
    func eachDeviceLandsInItsTier(_ vector: Vector) {
        #expect(DeviceMediaTier.classify(vector.signals) == vector.expected)
    }

    // MARK: - Les signaux mesurés tranchent quand l'identifiant ne dit rien

    @Test("sans décodeur HEVC matériel, aucun appareil ne dépasse « bas »")
    func noHardwareHEVCIsLow() {
        let fast = Self.signals("iPhone17,1", gib: 7.5, fps: 120, hevc: false, av1: true)
        #expect(DeviceMediaTier.classify(fast) == .low)
    }

    @Test("une mémoire rapportée sous le seuil d'un palier ne le franchit pas")
    func memoryGatesEachStep() {
        #expect(DeviceMediaTier.classify(Self.signals("iPhone14,5", gib: 3.4)) == .mid)
        #expect(DeviceMediaTier.classify(Self.signals("iPhone14,5", gib: 2.4)) == .low)
        #expect(DeviceMediaTier.classify(Self.signals("iPhone16,1", gib: 5.4, fps: 120, av1: true)) == .high)
    }

    @Test("un identifiant inconnu avec AV1 matériel vaut une puce récente, sans AV1 il plafonne à « moyen »")
    func unknownChipFallsBackOnDecoders() {
        let withAV1 = Self.signals("arm64", gib: 15.5, fps: 120, av1: true)
        let withoutAV1 = Self.signals("arm64", gib: 15.5, fps: 120)
        #expect(DeviceMediaTier.classify(withAV1) == .pro)
        #expect(DeviceMediaTier.classify(withoutAV1) == .mid)
    }

    @Test("le tier ne baisse jamais quand la mémoire, la cadence ou le décodage augmentent")
    func tierIsMonotonic() {
        let machines = ["iPhone10,1", "iPhone12,1", "iPhone14,5", "iPhone16,1", "iPad13,8", "arm64"]
        for machine in machines {
            let tiers = [1.5, 2.5, 3.7, 5.6, 7.5, 15.5].map {
                DeviceMediaTier.classify(Self.signals(machine, gib: $0, fps: 120, av1: true))
            }
            #expect(tiers == tiers.sorted(), "\(machine) : \(tiers)")
            let withoutFps = DeviceMediaTier.classify(Self.signals(machine, gib: 7.5, fps: 60, av1: true))
            let withFps = DeviceMediaTier.classify(Self.signals(machine, gib: 7.5, fps: 120, av1: true))
            #expect(withoutFps <= withFps)
        }
    }

    // MARK: - La famille de puce, depuis utsname.machine

    @Test("l'identifiant matériel d'un iPhone désigne sa puce")
    func iPhoneChip() {
        let cases: [(String, AppleChip)] = [
            ("iPhone9,1", .legacy), ("iPhone10,3", .a11), ("iPhone11,2", .a12), ("iPhone12,8", .a13),
            ("iPhone13,1", .a14), ("iPhone14,6", .a15), ("iPhone15,3", .a16), ("iPhone16,2", .a17),
            ("iPhone17,5", .a18), ("iPhone18,4", .a19), ("iPhone19,1", .future),
        ]
        for (machine, chip) in cases {
            #expect(AppleChip(machine: machine) == chip, "\(machine)")
        }
    }

    @Test("l'identifiant matériel d'un iPad désigne sa puce, M1 à M5 compris")
    func iPadChip() {
        let cases: [(String, AppleChip)] = [
            ("iPad7,5", .legacy), ("iPad8,9", .a12), ("iPad11,3", .a12), ("iPad12,2", .a13),
            ("iPad13,2", .a14), ("iPad13,19", .a14), ("iPad13,4", .m1), ("iPad13,17", .m1),
            ("iPad14,2", .a15), ("iPad14,6", .m2), ("iPad14,10", .m2), ("iPad15,4", .m3),
            ("iPad15,8", .a16), ("iPad16,2", .a17), ("iPad16,6", .m4), ("iPad17,3", .m5),
            ("iPad18,1", .future),
        ]
        for (machine, chip) in cases {
            #expect(AppleChip(machine: machine) == chip, "\(machine)")
        }
    }

    @Test("un identifiant qui n'est ni iPhone ni iPad, ou mal formé, n'est pas deviné")
    func unknownMachines() {
        for machine in ["arm64", "x86_64", "Mac14,2", "", "iPhone", "iPhone,1", "iPadX,Y", "iPad13,99", "iPod9,1"] {
            let expected: AppleChip = machine == "iPod9,1" ? .legacy : .unknown
            #expect(AppleChip(machine: machine) == expected, "\(machine)")
        }
    }

    @Test("les classes de puissance ordonnent les puces, M1 au niveau de l'A15, M2 de l'A16")
    func performanceClasses() {
        #expect(AppleChip.a11.performanceClass < AppleChip.a14.performanceClass)
        #expect(AppleChip.m1.performanceClass == AppleChip.a15.performanceClass)
        #expect(AppleChip.m2.performanceClass == AppleChip.a16.performanceClass)
        #expect(AppleChip.m3.performanceClass == AppleChip.a17.performanceClass)
        #expect(AppleChip.future.performanceClass >= AppleChip.m5.performanceClass)
        #expect(AppleChip.unknown.performanceClass == AppleChip.legacy.performanceClass)
    }

    // MARK: - Le simulateur, l'ordre des tiers

    @Test("sur simulateur, utsname rend « arm64 » : l'identifiant simulé fait foi")
    func simulatorIdentifierWins() {
        #expect(DeviceMediaSignals.machine(raw: "arm64", environment: ["SIMULATOR_MODEL_IDENTIFIER": "iPhone16,1"]) == "iPhone16,1")
        #expect(DeviceMediaSignals.machine(raw: "iPhone14,5", environment: [:]) == "iPhone14,5")
        #expect(DeviceMediaSignals.machine(raw: "", environment: [:]) == "unknown")
    }

    /// Sur simulateur, VideoToolbox répond pour la machine HÔTE (une VM de CI
    /// n'a aucun décodeur matériel) : le simulateur rangerait chaque appareil
    /// simulé en « bas ». Les décodeurs se déduisent alors de la puce SIMULÉE.
    @Test("sur simulateur, les décodeurs se déduisent de la puce simulée, jamais de l'hôte")
    func simulatorDecodersFollowTheSimulatedChip() {
        let iPhone16Pro = DeviceMediaSignals.simulated(machine: "iPhone17,1", physicalMemory: 16 * 1_073_741_824, maximumFramesPerSecond: 120)
        #expect(iPhone16Pro.hardwareDecodesHEVC)
        #expect(iPhone16Pro.hardwareDecodesAV1)
        #expect(DeviceMediaTier.classify(iPhone16Pro) == .pro)

        let iPhone15 = DeviceMediaSignals.simulated(machine: "iPhone15,4", physicalMemory: 16 * 1_073_741_824, maximumFramesPerSecond: 60)
        #expect(iPhone15.hardwareDecodesHEVC)
        #expect(!iPhone15.hardwareDecodesAV1)
        #expect(DeviceMediaTier.classify(iPhone15) == .high)

        let iPadAirM2 = DeviceMediaSignals.simulated(machine: "iPad14,8", physicalMemory: 16 * 1_073_741_824, maximumFramesPerSecond: 60)
        #expect(!iPadAirM2.hardwareDecodesAV1)
        #expect(DeviceMediaSignals.simulated(machine: "iPad16,3", physicalMemory: 0, maximumFramesPerSecond: 60).hardwareDecodesAV1)

        let unnamed = DeviceMediaSignals.simulated(machine: "arm64", physicalMemory: 16 * 1_073_741_824, maximumFramesPerSecond: 60)
        #expect(unnamed.hardwareDecodesHEVC)
        #expect(!unnamed.hardwareDecodesAV1)
    }

    @Test("les tiers s'ordonnent du plus faible au plus fort")
    func tiersAreOrdered() {
        #expect(DeviceMediaTier.low < .mid)
        #expect(DeviceMediaTier.mid < .high)
        #expect(DeviceMediaTier.high < .pro)
        #expect(DeviceMediaTier.allCases == [.low, .mid, .high, .pro])
    }
}
