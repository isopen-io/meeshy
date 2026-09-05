// apps/ios/Meeshy/Features/Main/Views/MessageListSnapshotPrep.swift

import Foundation
import MeeshySDK

/// **La préparation d'un snapshot de liste, mémoïsable par EMPREINTE (#4944).**
///
/// `applySnapshot` ne distinguait pas « la COMPOSITION de la fenêtre a changé »
/// de « une ligne a bougé de VERSION » : chaque accusé de lecture, chaque
/// réaction, chaque transcription et chaque réémission de frappe rebâtissait
/// `reversed` + les items + le regroupement par jour + la carte
/// `serverId → localId` — les ~75 ms mesurées sur device, payées sur le main
/// thread au milieu du défilement.
///
/// Ce type isole tout ce qui ne dépend QUE de la composition de la fenêtre.
/// Son `Fingerprint` répond en O(n) SANS ALLOUER à la seule question qui
/// décide de la dépense — « faut-il tout refaire ? » — là où la préparation,
/// elle, alloue trois tableaux et un dictionnaire.
///
/// **Le `serverId` entre dans l'empreinte, la `changeVersion` non.** L'accusé
/// du gateway pose un `serverId` sur une ligne optimiste sans changer l'ordre :
/// mémoïser sans lui rendrait `resolveLocalId` aveugle au message qu'on vient
/// d'envoyer, et le saut vers une citation ne trouverait plus sa cible. La
/// version, elle, ne décrit AUCUNE composition — c'est
/// `changedItems(records:baseline:presentIn:)` qui la lit, sur les records
/// VIVANTS du store, jamais sur ceux d'une préparation mémoïsée : ceux-là
/// seraient périmés par construction, et le reconfigure ciblé qu'ils
/// alimentent manquerait exactement les lignes qui viennent de bouger.
///
/// **Le type n'est pas `nonisolated`, son empreinte l'est** — et c'est une
/// contrainte, pas un oubli. La cible app isole au MainActor par défaut
/// (SE-0466, `project.yml`) et `MessageDayGrouping`, que l'init consomme, n'y
/// déroge pas : l'init doit donc rester isolé. `Fingerprint`, elle, ne touche
/// que des valeurs et se compare partout (mémo, `Optional`, tests) — voir sa
/// propre note. Le type reste PUR dans les deux cas : aucun UIKit, aucun état,
/// aucun effet de bord, et il n'est construit que depuis `applySnapshot`, déjà
/// sur le MainActor.
struct MessageListSnapshotPrep: Equatable {

    /// Ce qui, d'une fenêtre de messages, détermine les items du snapshot :
    /// l'ordre des `localId`, le `serverId` de chacun (la carte) et leur date
    /// (le découpage par jour). Deux fenêtres de même empreinte produisent la
    /// MÊME préparation — c'est la définition, et c'est ce que le mémo exploite.
    ///
    /// `nonisolated` EXPLICITE : c'est la valeur qu'on compare partout, y
    /// compris à travers des génériques nonisolated (`Optional`, les
    /// assertions de test), qu'une conformance isolée au MainActor ne
    /// satisferait pas. Rien dans son calcul n'a besoin du MainActor.
    nonisolated struct Fingerprint: Hashable {
        let count: Int
        let firstLocalId: String?
        let lastLocalId: String?
        /// Combiné des trois champs de composition, dans l'ORDRE. Les bornes
        /// ci-dessus ne suffisent pas : une permutation interne les laisse
        /// intactes, et servirait un flux dans le mauvais ordre.
        let orderHash: Int
        /// Le calendrier qui a DÉCOUPÉ les jours fait partie de la composition :
        /// les séparateurs dépendent du fuseau et de l'identifiant du
        /// calendrier. Sans lui, un changement de fuseau en cours de session
        /// (voyage, réglage système) laissait des séparateurs périmés tant que
        /// la fenêtre ne bougeait pas — avant le mémo, chaque pose les refaisait.
        let calendarIdentity: String

        init(records: [MessageRecord], calendar: Calendar = .current) {
            count = records.count
            firstLocalId = records.first?.localId
            lastLocalId = records.last?.localId
            var hasher = Hasher()
            for record in records {
                hasher.combine(record.localId)
                hasher.combine(record.serverId)
                hasher.combine(record.createdAt)
            }
            orderHash = hasher.finalize()
            calendarIdentity = "\(calendar.identifier)|\(calendar.timeZone.identifier)"
        }
    }

    let fingerprint: Fingerprint
    /// Items MESSAGE seuls, dans l'ordre d'affichage (liste inversée : index 0
    /// = le plus récent). Gardés à part des séparateurs : c'est sur EUX que se
    /// comptent les « vrais » nouveaux messages du badge non-lus.
    let messageItems: [MessageListItem]
    /// Le corps du flux : les messages, chaque groupe de jour suivi de son
    /// séparateur — qui se retrouve visuellement AU-DESSUS de ses messages,
    /// à la WhatsApp.
    let bodyItems: [MessageListItem]
    /// `serverId` (ObjectId du gateway) → `localId` (UUID client, clé des
    /// items du diffable). La puce de réponse d'une bulle porte l'id SERVEUR
    /// du message cité ; sans cette carte, aucun saut vers une citation reçue
    /// hors de cette session ne trouverait sa cible.
    let serverIdToLocalId: [String: String]
    /// `localId` du message le plus ANCIEN de la fenêtre — moitié de
    /// l'empreinte de la rangée « Début de la conversation ».
    let oldestLocalId: String?

    /// `reversedRecords` : la fenêtre DÉJÀ renversée (index 0 = le plus
    /// récent). `fingerprint` : celle des records dans l'ordre du store,
    /// calculée par l'appelant — c'est la MÊME valeur qui décide du rebuild et
    /// qui estampille le résultat, sans quoi le mémo ne se reconnaîtrait jamais.
    init(reversedRecords: [MessageRecord], fingerprint: Fingerprint, calendar: Calendar) {
        self.fingerprint = fingerprint

        let items = reversedRecords.map { MessageListItem.message(localId: $0.localId) }
        self.messageItems = items

        var map: [String: String] = [:]
        map.reserveCapacity(reversedRecords.count)
        for record in reversedRecords {
            if let serverId = record.serverId, !serverId.isEmpty {
                map[serverId] = record.localId
            }
        }
        self.serverIdToLocalId = map

        let groups = MessageDayGrouping.groupByDay(
            dates: reversedRecords.map(\.createdAt),
            calendar: calendar
        )
        var body: [MessageListItem] = []
        body.reserveCapacity(items.count + groups.count)
        for group in groups {
            for index in group.indices {
                body.append(items[index])
            }
            body.append(.dayHeader(dayStart: group.dayStart))
        }
        self.bodyItems = body

        self.oldestLocalId = reversedRecords.last?.localId
    }

    // MARK: - Ce qui NE se mémoïse pas : la version des lignes

    /// Les items dont la LIGNE a bougé depuis la dernière pose — l'exacte
    /// portée d'un reconfigure `.changedRecords`.
    ///
    /// `records` sont les records VIVANTS du store : leur `changeVersion` est
    /// la seule qui dise la vérité (invariant grdb-04 — toute écriture visible
    /// la bumpe). `present` borne le résultat aux items DÉJÀ dans le snapshot
    /// appliqué : reconfigurer un identifiant que le même `apply` est en train
    /// d'INSÉRER n'est pas supporté par UIKit et peut faire disparaître la
    /// bulle fraîchement insérée.
    static func changedItems(
        records: [MessageRecord],
        baseline: [String: Int64],
        presentIn present: Set<MessageListItem>
    ) -> [MessageListItem] {
        records.compactMap { record -> MessageListItem? in
            let item = MessageListItem.message(localId: record.localId)
            guard present.contains(item) else { return nil }
            guard baseline[record.localId] != record.changeVersion else { return nil }
            return item
        }
    }

    /// La base du prochain diff : la version de chaque ligne au moment de la
    /// pose. Jamais avancée pendant un report (§4.7ter) — le flush à la pose
    /// retrouve ainsi l'intégralité du delta.
    static func baseline(of records: [MessageRecord]) -> [String: Int64] {
        Dictionary(uniqueKeysWithValues: records.map { ($0.localId, $0.changeVersion) })
    }
}
