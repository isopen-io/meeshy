## 2026-10-24 : Le menu d'une conversation se lit dans un catalogue unique, tête compacte en tête (#11230)

**Contexte.** L'appui long d'une rangée de la liste a deux chemins d'OS : le `.contextMenu` natif (iOS 26, Liquid Glass) et le menu custom de repli (`ConversationContextMenuView`, < iOS 26). Depuis #11215 ils lisaient les mêmes verdicts (`ConversationRowMenuCapabilities`, projection de `ConversationActionPolicy`), mais chacun énumérait SES entrées, avec SES libellés et SES symboles : « Rechercher », « Appeler » et la fenêtre détachée n'existaient que sur le natif, et la parité ne tenait que par des gardes de source qui comparaient deux listes.

**Décision.**

- `ConversationMenuCatalog` (`Views/ConversationMenuCatalog.swift`, pur, `nonisolated`) rend le menu en cinq groupes : la tête (`header` : Épingler, Sourdine, Lu), `reach` (fenêtre, Rechercher, Appeler, Appel vidéo), `organize` (mode de lecture, Détails, Paramètres du groupe, Renommer, Favori, Déplacer), `more` (« Plus d'options ») et `departure` (Quitter, Supprimer ou Masquer). Il ne lit que la loi et l'état de la rangée ; `rowMenuCatalog(for:)` le calcule une fois pour les deux chemins.
- `ConversationMenuEntry` est LA table des libellés et des symboles du menu d'une conversation (motif de `MessageActionVerb`, #11234) : une bascule est deux entrées, chacune dit ce que le geste fera. `ConversationRowMenuActions.perform(_:)` relie chaque entrée à SA closure ; les sous-menus n'agissent pas.
- La tête est un `ControlGroup` sur le menu natif (iOS 26 : toujours rendu en rangée dans un menu contextuel) et trois tuiles sur le menu custom.
- **Appel vidéo** en direct, comme l'appel audio : la loi (`call` / `videoCall`, `CallPermission.canStartCall`) et un pair connu qui n'est pas soi. Les deux passent par `requestPermissionsThenStartCall`.
- **Paramètres du groupe** quand la loi accorde `manageMembers` (MODERATOR+ sur un type qui se gère) : `ConversationSettingsView` en feuille, derrière la même porte que la fiche (`ConversationOpenRoute.mayShowInfo`).
- La fenêtre détachée reste gardée par `ConversationOpenRoute.mayDetach(isLocked:)`, désormais `nonisolated` pour que le catalogue pur la lise.

**Conséquences.** Le menu custom offre désormais aussi la fenêtre détachée, Rechercher, les appels et le mode de lecture : les deux chemins rendent la même liste, et un témoin le prouve sur les actions nommées de VoiceOver. Les gardes de source qui cherchaient les libellés dans le builder natif les cherchent au catalogue. Les réglages ouverts depuis la liste reçoivent le rôle de conversation servi : un ADMIN de plateforme simple membre y voit le menu mais pas les réglages réservés aux administrateurs du groupe. Le miroir Kotlin n'a rien reçu.
