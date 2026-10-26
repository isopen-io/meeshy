## 2026-10-25 : Le clair E2EE ne s'écrit sur le disque que dans le coffre libsignal, pour le compte de la session, et il en part avec le message (#12999, #13000, #13001)

**Contexte.** Le lot #12968 lisait le dernier message d'une ligne de liste dans le coffre local. Sa revue adversariale a relevé trois points. Le clair de mes envois chiffrés s'écrivait aussi :
- dans la ligne GRDB (`meeshy.sqlite`, protégée après le premier déverrouillage, gardée à l'écho par `keepLocalPlaintext`) ;
- dans l'aperçu de liste ;
- dans le cache du fil, avec le clair déchiffré des pairs et sa provenance ;
- dans un brouillon et dans un favori.

Elle a aussi relevé que le coffre se lisait sans contrôler le compte, et qu'un message effacé y restait. Modèles de menace : appareil volé, et serveur compromis qui sert à un compte B les conversations d'un compte A sur le même appareil.

**Décision.**
- **La loi est posée aux points d'ÉCRITURE**, jamais à chaque appelant (`EndToEndDiskPlaintextLaw`, SDK) :
  - `MessageRecord.encode(to: PersistenceContainer)` écrit le littéral `[Encrypted]` pour toute ligne `isEncrypted` en mode `e2ee` ;
  - `MeeshyMessage.encode` fait de même pour un message chiffré ou porteur d'un clair déchiffré, et n'écrit plus sa provenance.

  Un chemin d'écriture futur ne peut pas y échapper.
- **L'envoi range le clair dans le coffre AVANT sa ligne optimiste** (`EndToEndSendSealer.keepBeforeStaging`). La ligne naît scellée. La bulle, la ligne de liste et le renvoi d'un échec relisent le clair dans le coffre. Si le coffre refuse, l'envoi ne part pas.
- **L'aperçu de liste d'un envoi chiffré est scellé** chez le producteur (`OptimisticAuthor.writesEndToEnd`, `LastMessageFacet.acknowledged`) et dans le récepteur (`ConversationSyncEngine.updateConversationAfterSend`, selon le régime de la ligne).
- **Ce qui n'est pas scellé ne s'écrit pas** : ni le brouillon d'une conversation chiffrée (`ConversationDraftCoordinator.keepsDraftsOnDisk`), ni l'extrait d'un favori, ni la légende d'une pièce refusée.
- **Le clair déjà écrit par une version antérieure s'en va.** À l'ouverture de la session, une fois par compte, `EndToEndDiskPlaintextMigration` agit sur les messages que le coffre de ce compte tient :
  - leurs lignes et leurs citations sont rescellées, sous `secure_delete` ;
  - l'index plein texte est compacté et le journal tronqué ;
  - les aperçus qui les nomment sont rescellés ;
  - les caches du fil des conversations chiffrées sont vidés, ainsi que leurs brouillons et leurs favoris.
- **Le coffre ne sert que le compte de la session, et seulement s'il en est l'enrôlement.** `E2EEPlaintextVault(owner:)` le vérifie dans la transaction. L'appelant affirme le compte (`plaintexts(for:as:)`), parce que la session se ferme derrière une file. L'ouvreur d'enveloppes a son propriétaire.
- **Un message effacé quitte le coffre.** La base des messages inscrit l'identifiant, jamais le texte, dans `e2ee_plaintext_erasures`, avec sa cause :
  - par déclencheur, à la mise à jour comme à l'insertion : suppression pour tous, vue unique ouverte ;
  - dans la transaction du retrait : éphémère échu, retrait pour moi ;
  - par identifiant, sans ligne locale.

  Une suppression lancée ici attend la confirmation du serveur (réponse, écho, page REST). Une suppression annulée ne retire que sa propre inscription. `EndToEndPlaintextJanitor` vide le coffre pour le compte de la base. La rétention locale, l'accès révoqué et les doublons n'inscrivent rien : le coffre est la seule copie de ce clair. Le coffre efface sous `secure_delete` et tronque son journal.

**Conséquences.**
- Un brouillon d'une conversation chiffrée ne survit pas à l'arrêt de l'app (#13062).
- Le cache du fil se relit scellé et le clair se repose depuis le coffre : c'est une lecture locale.
- La recherche locale ne trouve pas le texte d'un message chiffré (#13064).
- Un serveur compromis peut annoncer une suppression ou une ouverture de vue unique, et faire ainsi effacer un clair local : une suppression authentifiée par libsignal est à décider (#13060).
- Supprimer une conversation ou effacer l'historique ne vide pas encore le coffre (#13061).
- Le miroir Kotlin (`apps/android`) n'a rien reçu.
- Une revue cryptographique externe reste requise.
