# Cycle 49 — le serveur disait « il n'y a plus rien », et quatre clients entendaient « je ne parle pas de ça »

Routine « amélioration continue temps réel ». Le cycle 46 bis a appris à
l'aperçu de ligne de liste à RECULER quand le serveur déclare l'avoir recalculé,
et a légué NOMMÉMENT le cran au-delà : le cas où il n'y a plus rien vers quoi
reculer. C'est ce cycle-ci, avec sa question ouverte tranchée d'abord.

## Constat

- [x] Question léguée par le cycle 46 bis — « la ligne sait-elle rendre une
      conversation sans dernier message, ou faut-il d'abord lui en donner la
      forme ? » — **tranchée AVANT d'écrire : elle sait déjà.**
      `resolvedLastMessagePreview` rend `nil`, `ThemedConversationRow` le traite
      (`!isEmpty`), VoiceOver compris. Aucune forme nouvelle à introduire
- [x] Le gateway dit déjà la vérité : `messagePayloadFor(null)` sert tout le
      groupe d'aperçu à `null` quand le lecteur n'a plus aucun message visible.
      Témoin de forme écrit, **vert d'emblée** — rien à corriger côté serveur
- [x] Défaut livré : les `if let` du client jettent ce payload champ par champ,
      et la ligne garde l'aperçu de ce que le lecteur vient de masquer —
      **définitivement**, plus rien ne viendra le remplacer
- [x] Pire que « rien ne bouge » : le seul champ déjà tri-étaté (la carte du
      Prisme, cycle 46 bis) s'appliquait. La traduction s'effaçait, l'aperçu brut
      restait — **« Bonjour » → « Hello »**, le masquage exposant l'original
- [x] `Optional` ne pouvait pas trancher : un renommage n'emporte AUCUNE clé
      `lastMessage*`, donc « `lastMessageAt == nil` ⇒ vider » effacerait toutes
      les lignes à chaque changement de titre

## Correctifs

- [x] `LastMessageIdentity` (`.unchanged` / `.replaced(String?)`) remplace
      `String?` — l'IDENTITÉ porte le fait pour tout le groupe, seule nullité qui
      veut dire « aucun » et non « inconnu »
- [x] `MeeshyConversation.clearLastMessage()` — geste unique, **onze** champs,
      idempotent. Un vidage partiel laisserait « Message expiré » ou une épingle
      décrire un message que le lecteur ne voit plus
- [x] `lastMessageAt` délibérément intact : c'est le RANG de la ligne, donnée
      globale qu'un masquage personnel ne change pour personne
- [x] Quatre surfaces câblées : décodage SDK, `merging` (RAM **et** cache
      disque), le pont, `ConversationListViewModel` (app)
- [x] Web : la ligne rend `conversation.lastMessage` (l'objet), que rien ne
      touchait — le patch le vide désormais, et cesse de recopier un
      `lastMessageId` fantôme que personne ne lit
- [x] Android indemne (`refreshSilently()` REST par événement) — noté, pas touché
- [x] **Dernière copie du geste** refermée dans la foulée :
      `recomputeLastMessagePreviewAfterDeletion` vidait 2 champs sur 11 à la main

## Gates

- [x] 3 témoins gateway de FORME (présence des clés autant que nullité), double
      prisma complet, + contre-épreuve du lecteur non concerné
- [x] 3 de décodage, 4 de fusion (vidage complet, rang conservé, renommage
      neutre, idempotence), 1 de bout en bout à travers le pont
- [x] 2 côté app, 4 côté web dont un **RED prouvé** (fix retiré → rouge)
- [x] Contre-épreuve du renommage sur **chacune des quatre surfaces**
- [x] `bunx tsc --noEmit` gateway : 0 ; web : aucune erreur nouvelle
      (comparaison ensembliste, 1233 préexistantes)
- [x] Suite gateway COMPLÈTE : **733 suites / 17 850 tests** verts
- [x] Swift vérifié par CI (`sdk-tests.yml`, `ios.yml`) — pas de toolchain ici
- [x] CHANGELOG + ADR `packages/MeeshySDK/decisions.md` + journal d'audit
      (cycle 49) + leçon 207

## Revue

Voir `tasks/realtime-sync-audit-2026-08-16-cycle49.md` — pourquoi la question
léguée se referme sans nouveau modèle, le tableau des quatre champs et de leur
sort, pourquoi seule l'identité pouvait porter le fait, pourquoi `lastMessageAt`
ne bouge pas, le contraste Android (immunisé par un aller-retour REST), les
options écartées, et les deux pistes restantes : les DEUX implémentations
divergentes du même événement côté iOS (troisième cycle consécutif à devoir
corriger aux deux endroits), et les trois émetteurs de `conversation:updated` qui
composent leur payload à la main sans rien pour empêcher un quatrième d'y glisser
un `lastMessageId: null` par inadvertance.
