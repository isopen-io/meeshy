// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+ThreadQuiescence.swift

import UIKit

extension MessageListViewController {

    /// **L'UNIQUE porte du data source** (#3947).
    ///
    /// Le cycle précédent a arrêté deux dépenses sous un pane opaque : le
    /// RENDU (`vc.view.isHidden`) et l'HORLOGE (`syncThreadQuiescence`, le
    /// réveil 4 Hz du suivi de lecture). Il a explicitement laissé la
    /// troisième de côté, et sa garde le dit : « les abonnements Combine
    /// d'`observeStore()` sont dirigés par événement et ne coûtent rien tant
    /// que rien n'arrive ».
    ///
    /// C'est juste À L'IDLE, et faux dans une conversation VIVANTE — qui est
    /// le cas nominal de la Rivière. Un message qui arrive, une traduction qui
    /// tombe, une transcription, une réaction, un accusé : chacun rebâtissait
    /// un snapshot ENTIER (O(n) : `reversed` + `map` + `groupByDay` + la carte
    /// `serverId → localId`), le diffait, et réalisait les
    /// `UIHostingConfiguration` des cellules — pour des pixels que personne ne
    /// voit. Le Prisme, à lui seul, en produit un par traduction servie.
    ///
    /// **On ne suspend pas les abonnements, on neutralise leur PUITS.**
    /// Les suspendre exigerait de les REJOUER au réveil, donc de savoir
    /// lesquels sont rejouables et lesquels sont front-déclenchés — une
    /// surface de correction pour une dépense qu'une garde d'une ligne
    /// supprime. La source de vérité (`store.messages`) n'est jamais
    /// suspendue : au réveil, `readingMode.didSet` réapplique `.allItems`,
    /// qui SUBSUME toute application sautée ici, quelle qu'en soit l'origine.
    ///
    /// **Pourquoi un entonnoir plutôt que quatre gardes.** Quatre sites
    /// atteignaient `dataSource.apply` : `applySnapshot`, le `didSet` de
    /// `overlaidMessageId`, `reconfigureVisibleCells` et
    /// `reconfigureMessages(serverIds:)` — plus `reconfigureFocalItems`, que
    /// seul un mode RENDU emprunte. Les garder un par un aurait tenu
    /// aujourd'hui et menti demain : une énumération de sites affirme deux
    /// choses, « ces sites appliquent la règle » (vérifiable) et « ce sont les
    /// sites où elle s'applique » (jamais vérifiée). Une porte unique rend la
    /// seconde affirmation inutile — un applicateur neuf est gardé parce qu'il
    /// passe par ici, et la garde de source refuse qu'il passe ailleurs.
    ///
    /// **La complétion s'exécute TOUJOURS, appliqué ou non.** Elle ne porte
    /// pas que du dessin : elle désarme des verrous
    /// (`focalReconfigureInFlight`, `focalDetailsPendingAfterApply`). Un
    /// entonnoir qui l'avalerait les laisserait armés pour toujours — un
    /// défaut PIRE que la dépense qu'il évite.
    func applyToDataSource(
        _ snapshot: NSDiffableDataSourceSnapshot<MessageListSection, MessageListItem>,
        completion: @escaping () -> Void
    ) {
        guard rendersThread else {
            completion()
            return
        }
        dataSource.apply(snapshot, animatingDifferences: false, completion: completion)
    }
}
