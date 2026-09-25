## 2026-08-16 : Le masquage PERSONNEL se purge, il ne se met pas en pierre tombale

**Context**: le gateway diffuse `message:hidden-for-me` dans la room de l'UTILISATEUR pour que
ses autres appareils convergent (`personalMessageVisibilitySync.ts`, contrat en quatre points).
iOS n'avait aucun abonné : un message masqué depuis le web restait affiché dans le fil pour toute
la session, pendant que la ligne de liste, elle, était corrigée par le `conversation:updated`
jumeau. Le canal doit exister parce qu'un filtre de LECTURE (`personalHistoryFilter`) ne rétrécit
que ce qu'une NOUVELLE requête renvoie : il n'a aucune prise sur une ligne que le client détient
déjà.

**Decision**: brancher le canal sur un geste de persistance DISTINCT de la suppression —
`MessagePersistenceActor.purgeMessages(ids:)`, qui retire la ligne et ses tables filles au lieu
d'écrire un `deletedAt`. Résolution par `localId` OU `serverId`, comme `markDeleted`. Un
rafraîchissement `messageStoreShouldRefresh` PAR conversation touchée.

**Pourquoi PAS `markDeleted`** : le web route bien `hidden-for-me` vers son chemin de suppression,
mais parce que ce chemin FILTRE le message hors du cache. iOS, lui, pose une pierre tombale (« ce
message a été supprimé »), juste pour une suppression POUR TOUS et fausse ici : le message reste
VIVANT pour les autres participants. Et elle serait DURABLE — le serveur ne renverra plus jamais
ce message à ce lecteur, donc aucune relecture n'effacerait la pierre. On aurait échangé une bulle
fantôme contre une tombstone à vie.

**Alternatives rejetées**:
- *Réutiliser `messageDeleted` en re-émettant N événements*, comme le web réutilise ses
  `deleteListeners`. Séduisant par symétrie, faux par sémantique (ci-dessus).
- *Marquer la ligne d'un drapeau « masquée » plutôt que la supprimer.* Un troisième état sur le
  même champ, pour une donnée que rien ne relira jamais : le serveur a déjà tranché, et la ligne
  ne peut revenir que par une relecture REST qui la réinsère.
- *Un consommateur global plutôt que per-conversation.* Reporté : le handler par conversation
  ferme le défaut VISIBLE (le fil ouvert), et les autres fils se réparent au prochain chargement
  REST, déjà filtré côté serveur.

**Cons**: `ConversationSocketHandler` n'existe que si une conversation est ouverte — un masquage
reçu sur l'écran de liste ne purge rien localement, et le rendu cache-first peut montrer la ligne
périmée une fraction de seconde au prochain ouvrage. `message:restored-for-me` reste sans abonné
iOS : une APPARITION ne peut pas s'écrire comme une tombstone inversée, l'appareil qui a purgé la
ligne n'en détient plus le contenu. Les deux sont documentés (§7-8 de
`tasks/realtime-sync-audit-2026-08-16-cycle54.md`).
