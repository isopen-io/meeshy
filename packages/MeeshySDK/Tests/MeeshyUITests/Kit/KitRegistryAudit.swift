import Foundation
@testable import MeeshyUI

/// La règle de `KitRegistryGuardTests`, sans disque : le registre, le catalogue et
/// ce que le disque porte entrent en paramètres, les problèmes sortent en phrases.
enum KitRegistryAudit {

    struct Lot: Equatable {
        let key: String
        let name: String
        let target: String
    }

    /// Ce que le disque porte : les chemins (relatifs à la racine du dépôt) qui
    /// existent, et les images sous `Kit/__Snapshots__/` (relatives à ce dossier).
    struct Disk: Equatable {
        let existing: Set<String>
        let images: [String]
    }

    static let witnessFolder = "packages/MeeshySDK/Tests/MeeshyUITests/Kit"

    /// Les chemins que la garde demande au disque : la cible que le REGISTRE déclare
    /// (`cible_ios`, jamais un chemin reconstruit du nom) et le témoin de chaque lot.
    static func candidatePaths(lots: [Lot]) -> [String] {
        lots.flatMap { [$0.target, witnessPath(name: $0.name)] }
    }

    static func witnessPath(name: String) -> String { "\(witnessFolder)/\(name)Tests.swift" }

    static func problems(
        lots: [Lot],
        entries: [MeeshyKitCatalogEntry],
        boardViewIDs: Set<String>,
        disk: Disk
    ) -> [String] {
        var found = sequenceProblems(lots: lots, entries: entries)
        for lot in lots {
            guard let entry = entries.first(where: { $0.key == lot.key }) else { continue }
            found += lotProblems(lot: lot, entry: entry, boardViewIDs: boardViewIDs, disk: disk)
        }
        return found
    }

    private static func sequenceProblems(lots: [Lot], entries: [MeeshyKitCatalogEntry]) -> [String] {
        let sameKeys = lots.map(\.key) == entries.map(\.key)
        let sameNames = lots.map(\.name) == entries.map(\.name)
        return sameKeys && sameNames ? [] : ["le catalogue ne porte pas les clés et les noms du registre, dans l'ordre"]
    }

    private static func lotProblems(lot: Lot, entry: MeeshyKitCatalogEntry, boardViewIDs: Set<String>, disk: Disk) -> [String] {
        guard disk.existing.contains(lot.target) else {
            return entry.isDelivered ? ["\(lot.key) \(lot.name) : la cible \(lot.target) n'existe pas, l'entrée doit être vide"] : []
        }
        guard entry.isDelivered else {
            return ["\(lot.key) \(lot.name) : la cible existe, l'entrée est vide"]
        }
        return witnessProblems(lot: lot, disk: disk)
            + boardViewProblems(lot: lot, entry: entry, boardViewIDs: boardViewIDs)
            + imageProblems(lot: lot, entry: entry, disk: disk)
    }

    private static func witnessProblems(lot: Lot, disk: Disk) -> [String] {
        disk.existing.contains(witnessPath(name: lot.name)) ? [] : ["\(lot.key) : le témoin \(lot.name)Tests est absent"]
    }

    private static func boardViewProblems(lot: Lot, entry: MeeshyKitCatalogEntry, boardViewIDs: Set<String>) -> [String] {
        entry.states.compactMap(\.boardView)
            .filter { !boardViewIDs.contains($0) }
            .map { "\(lot.key) : la vue \($0) n'est pas dans la table S de la planche" }
    }

    private static func imageProblems(lot: Lot, entry: MeeshyKitCatalogEntry, disk: Disk) -> [String] {
        let expected = entry.states.flatMap { state in
            SnapshotHelpers.kitVariants(for: state).map { SnapshotHelpers.kitImageStem(id: state.id, variant: $0) }
        } + [SnapshotHelpers.KitVariant.grandePolice, .rtl].map {
            SnapshotHelpers.kitImageStem(id: SnapshotHelpers.kitBoardID, variant: $0)
        }
        return expected
            .filter { stem in !disk.images.contains { $0.hasPrefix("\(lot.name)/\(stem)") && $0.hasSuffix(".png") } }
            .map { "\(lot.key) : l'image \(lot.name)/\($0) est absente" }
    }
}
