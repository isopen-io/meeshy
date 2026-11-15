#if DEBUG
import SwiftUI

/// Le catalogue du kit : les 25 entrées du registre, dans l'ordre, et le
/// répartiteur qui rend le contenu d'une tuile. Écrit UNE fois : chaque lot du
/// kit ne modifie que son propre `MeeshyKitCatalog+Kxx.swift`.
public nonisolated enum MeeshyKitCatalog {
    public static let entries: [MeeshyKitCatalogEntry] = [
        entryK01, entryK02, entryK03, entryK04, entryK05,
        entryK06, entryK07, entryK08, entryK09, entryK10,
        entryK11, entryK12, entryK13, entryK14, entryK15,
        entryK16, entryK17, entryK18, entryK19, entryK20,
        entryK21, entryK22, entryK23, entryK24, entryK25,
    ]

    public static var listedEntries: [MeeshyKitCatalogEntry] {
        listed(in: entries)
    }

    /// Les entrées LIVRÉES, dans l'ordre : une entrée sans état n'apparaît pas.
    public static func listed(in entries: [MeeshyKitCatalogEntry]) -> [MeeshyKitCatalogEntry] {
        entries.filter(\.isDelivered)
    }

    /// L'entrée livrée dont la clé est `key` (casse ignorée) ; `nil` pour une clé
    /// inconnue ou non livrée.
    public static func listedEntry(
        matching key: String,
        in entries: [MeeshyKitCatalogEntry] = MeeshyKitCatalog.entries
    ) -> MeeshyKitCatalogEntry? {
        listed(in: entries).first { $0.key.caseInsensitiveCompare(key) == .orderedSame }
    }

    @MainActor @ViewBuilder
    public static func content(key: String, state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        switch key {
        case "K01": contentK01(state: state, isPressed: isPressed)
        case "K02": contentK02(state: state, isPressed: isPressed)
        case "K03": contentK03(state: state, isPressed: isPressed)
        case "K04": contentK04(state: state, isPressed: isPressed)
        case "K05": contentK05(state: state, isPressed: isPressed)
        case "K06": contentK06(state: state, isPressed: isPressed)
        case "K07": contentK07(state: state, isPressed: isPressed)
        case "K08": contentK08(state: state, isPressed: isPressed)
        case "K09": contentK09(state: state, isPressed: isPressed)
        case "K10": contentK10(state: state, isPressed: isPressed)
        case "K11": contentK11(state: state, isPressed: isPressed)
        case "K12": contentK12(state: state, isPressed: isPressed)
        case "K13": contentK13(state: state, isPressed: isPressed)
        case "K14": contentK14(state: state, isPressed: isPressed)
        case "K15": contentK15(state: state, isPressed: isPressed)
        case "K16": contentK16(state: state, isPressed: isPressed)
        case "K17": contentK17(state: state, isPressed: isPressed)
        case "K18": contentK18(state: state, isPressed: isPressed)
        case "K19": contentK19(state: state, isPressed: isPressed)
        case "K20": contentK20(state: state, isPressed: isPressed)
        case "K21": contentK21(state: state, isPressed: isPressed)
        case "K22": contentK22(state: state, isPressed: isPressed)
        case "K23": contentK23(state: state, isPressed: isPressed)
        case "K24": contentK24(state: state, isPressed: isPressed)
        case "K25": contentK25(state: state, isPressed: isPressed)
        default: EmptyView()
        }
    }
}
#endif
