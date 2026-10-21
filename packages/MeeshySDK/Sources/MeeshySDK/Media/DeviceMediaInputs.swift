import Foundation

/// **Les entrées NEUTRES du tier média (#11281)** — ce que toute plateforme sait
/// dire d'elle-même, et rien d'autre. iOS les PRODUIT depuis `utsname`,
/// `ProcessInfo`, l'écran et VideoToolbox (`DeviceMediaSignals.inputs`) ; le web
/// (lot W10) depuis `navigator.deviceMemory`, `hardwareConcurrency` et
/// `MediaCapabilities`. La loi qui les range (`DeviceMediaTier.classify`) ne lit
/// aucune puce : c'est ce qui permet aux deux jumelles de rejouer le MÊME
/// fichier de vecteurs, `packages/shared/fixtures/device-tier-vectors.json`.
///
/// Les noms de champs sont ceux du fichier de vecteurs, à l'identique.
public struct DeviceMediaInputs: Sendable, Equatable, Decodable {

    public enum Thermal: String, Sendable, Equatable, Decodable {
        case nominal, fair, serious, critical

        public init(_ state: ProcessInfo.ThermalState) {
            switch state {
            case .nominal: self = .nominal
            case .fair: self = .fair
            case .serious: self = .serious
            case .critical: self = .critical
            @unknown default: self = .critical
            }
        }
    }

    /// Mémoire RAPPORTÉE, en Gio ; `nil` = inconnue (Safari), ne baisse rien.
    public let memoryGB: Double?
    /// Cœurs logiques actifs ; `nil` = inconnu, ne baisse rien.
    public let cores: Int?
    public let maxFps: Int
    public let hwAV1: Bool
    public let hwHEVC: Bool
    public let lowPower: Bool
    public let thermal: Thermal

    public init(
        memoryGB: Double?,
        cores: Int?,
        maxFps: Int,
        hwAV1: Bool,
        hwHEVC: Bool,
        lowPower: Bool,
        thermal: Thermal
    ) {
        self.memoryGB = memoryGB
        self.cores = cores
        self.maxFps = maxFps
        self.hwAV1 = hwAV1
        self.hwHEVC = hwHEVC
        self.lowPower = lowPower
        self.thermal = thermal
    }
}
