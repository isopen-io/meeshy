import Foundation

/// Le nom LISIBLE d'un appareil Apple, déduit de son identifiant de modèle
/// (`iPhone16,1` → « iPhone 15 Pro ») — ce que l'en-tête `X-Meeshy-Device-Name`
/// déclare au serveur (#9610, `packages/shared/utils/client-session.ts`).
///
/// **Jamais `UIDevice.current.name`** : depuis iOS 16, il ne rend que le nom
/// générique, et avant il rendait le nom que l'utilisateur a CHOISI
/// (« iPhone de Marie ») — une donnée personnelle qui n'a rien à faire dans un
/// relevé de session. Le modèle dit assez pour qu'on reconnaisse son appareil.
///
/// Un identifiant absent de la table garde sa FAMILLE (« iPhone », « iPad ») :
/// un modèle sorti après ce binaire se reconnaît encore, sans mentir sur sa
/// génération.
public enum DeviceModelName {

    /// L'identifiant de modèle du simulateur, que `uname` remplace par
    /// l'architecture de l'hôte (`arm64`, `x86_64`).
    static let simulatorModelKey = "SIMULATOR_MODEL_IDENTIFIER"

    private static let hostArchitectures: Set<String> = ["arm64", "x86_64", "i386"]

    /// Le nom lisible de `identifier`, ou `nil` quand rien de sûr ne s'en dit.
    public static func readable(
        forIdentifier identifier: String,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> String? {
        guard hostArchitectures.contains(identifier) else { return named(identifier) }
        guard let simulated = environment[simulatorModelKey], !hostArchitectures.contains(simulated) else { return nil }
        return named(simulated).map { "\($0) (Simulator)" }
    }

    private static func named(_ identifier: String) -> String? {
        if let known = table[identifier] { return known }
        return families.first { identifier.hasPrefix($0.prefix) }?.name
    }

    private static let families: [(prefix: String, name: String)] = [
        ("iPhone", "iPhone"),
        ("iPad", "iPad"),
        ("iPod", "iPod touch"),
        ("RealityDevice", "Apple Vision Pro"),
        ("Mac", "Mac")
    ]

    private static let table: [String: String] = [
        // iPhone
        "iPhone10,1": "iPhone 8", "iPhone10,4": "iPhone 8",
        "iPhone10,2": "iPhone 8 Plus", "iPhone10,5": "iPhone 8 Plus",
        "iPhone10,3": "iPhone X", "iPhone10,6": "iPhone X",
        "iPhone11,2": "iPhone XS",
        "iPhone11,4": "iPhone XS Max", "iPhone11,6": "iPhone XS Max",
        "iPhone11,8": "iPhone XR",
        "iPhone12,1": "iPhone 11",
        "iPhone12,3": "iPhone 11 Pro",
        "iPhone12,5": "iPhone 11 Pro Max",
        "iPhone12,8": "iPhone SE (2nd generation)",
        "iPhone13,1": "iPhone 12 mini",
        "iPhone13,2": "iPhone 12",
        "iPhone13,3": "iPhone 12 Pro",
        "iPhone13,4": "iPhone 12 Pro Max",
        "iPhone14,4": "iPhone 13 mini",
        "iPhone14,5": "iPhone 13",
        "iPhone14,2": "iPhone 13 Pro",
        "iPhone14,3": "iPhone 13 Pro Max",
        "iPhone14,6": "iPhone SE (3rd generation)",
        "iPhone14,7": "iPhone 14",
        "iPhone14,8": "iPhone 14 Plus",
        "iPhone15,2": "iPhone 14 Pro",
        "iPhone15,3": "iPhone 14 Pro Max",
        "iPhone15,4": "iPhone 15",
        "iPhone15,5": "iPhone 15 Plus",
        "iPhone16,1": "iPhone 15 Pro",
        "iPhone16,2": "iPhone 15 Pro Max",
        "iPhone17,3": "iPhone 16",
        "iPhone17,4": "iPhone 16 Plus",
        "iPhone17,1": "iPhone 16 Pro",
        "iPhone17,2": "iPhone 16 Pro Max",
        "iPhone17,5": "iPhone 16e",
        "iPhone18,3": "iPhone 17",
        "iPhone18,4": "iPhone Air",
        "iPhone18,1": "iPhone 17 Pro",
        "iPhone18,2": "iPhone 17 Pro Max",
        // iPad
        "iPad12,1": "iPad (9th generation)", "iPad12,2": "iPad (9th generation)",
        "iPad13,18": "iPad (10th generation)", "iPad13,19": "iPad (10th generation)",
        "iPad15,7": "iPad (A16)", "iPad15,8": "iPad (A16)",
        "iPad14,1": "iPad mini (6th generation)", "iPad14,2": "iPad mini (6th generation)",
        "iPad16,1": "iPad mini (A17 Pro)", "iPad16,2": "iPad mini (A17 Pro)",
        "iPad13,1": "iPad Air (4th generation)", "iPad13,2": "iPad Air (4th generation)",
        "iPad13,16": "iPad Air (5th generation)", "iPad13,17": "iPad Air (5th generation)",
        "iPad14,8": "iPad Air 11-inch (M2)", "iPad14,9": "iPad Air 11-inch (M2)",
        "iPad14,10": "iPad Air 13-inch (M2)", "iPad14,11": "iPad Air 13-inch (M2)",
        "iPad15,3": "iPad Air 11-inch (M3)", "iPad15,4": "iPad Air 11-inch (M3)",
        "iPad15,5": "iPad Air 13-inch (M3)", "iPad15,6": "iPad Air 13-inch (M3)",
        "iPad13,4": "iPad Pro 11-inch (3rd generation)", "iPad13,5": "iPad Pro 11-inch (3rd generation)",
        "iPad13,6": "iPad Pro 11-inch (3rd generation)", "iPad13,7": "iPad Pro 11-inch (3rd generation)",
        "iPad13,8": "iPad Pro 12.9-inch (5th generation)", "iPad13,9": "iPad Pro 12.9-inch (5th generation)",
        "iPad13,10": "iPad Pro 12.9-inch (5th generation)", "iPad13,11": "iPad Pro 12.9-inch (5th generation)",
        "iPad14,3": "iPad Pro 11-inch (4th generation)", "iPad14,4": "iPad Pro 11-inch (4th generation)",
        "iPad14,5": "iPad Pro 12.9-inch (6th generation)", "iPad14,6": "iPad Pro 12.9-inch (6th generation)",
        "iPad16,3": "iPad Pro 11-inch (M4)", "iPad16,4": "iPad Pro 11-inch (M4)",
        "iPad16,5": "iPad Pro 13-inch (M4)", "iPad16,6": "iPad Pro 13-inch (M4)",
        // iPod
        "iPod9,1": "iPod touch (7th generation)"
    ]
}
