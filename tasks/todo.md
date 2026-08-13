# Cycle 114 — routine messaging (2026-08-13)

## Audit

Point de départ : cycle 113 (`fix(sync)`, borne de poids sur `/sync`) mergé, arbre propre,
branche == `main`. Les cycles 111–113 avaient tous mordu côté **gateway** sur les canaux de
rattrapage. Ce cycle a donc audité les **récepteurs** de ces canaux, plateforme par plateforme.

Constats du balayage (les trois sont réels ; un seul a été livré) :

1. **`GET /sync` n'a AUCUN consommateur client.** Ni iOS, ni web n'appellent la route — c'est un
   pilote serveur (collection `messages`, spec A3). Les cycles 111–113 l'ont durci sans que
   personne le lise encore. Pas un défaut : un chantier en avance sur ses clients.
2. **Le masquage personnel au niveau MESSAGE n'a aucune surface produit.**
   `DELETE /api/messages/:id/delete-for-me`, sa jumelle bulk et `restore-for-me` existent, sont
   testées, diffusent (`message:hidden-for-me` / `message:restored-for-me`), et le web ÉCOUTE ces
   events — mais **aucun client n'appelle les routes**. iOS n'écoute même pas les events. Capacité
   serveur complète, sans déclencheur. À trancher (exposer ou retirer) — **non traité ce cycle**,
   c'est une décision produit, pas un correctif.
3. **[LIVRÉ] iOS jetait `meta.deletedConversationIds` du delta des conversations.** → PR #2966.

## Livré — PR #2966

`fix(ios/sync): les SORTIES de conversation annoncées par le delta n'atteignaient pas iOS`

- `APIResponseMeta` : + `deletedConversationIds`, + `deletedConversationIdsTruncated`.
- `OffsetPaginatedAPIResponse` : + `meta` (défaut `nil`).
- `mergeDeltaConversations(existing:deltas:tombstoneIds:)` : tombstones APRÈS les upserts,
  `removedIds` dédupliqué.
- Troncature des tombstones repliée dans `mayHaveMore` (escalade `fullSync` + curseur retenu).
- Index FTS local purgé au retrait ; ré-index du même lot filtré par `removedSet`.

TDD : 5 tests d'unité (fusion), 4 bout-en-bout (moteur), 3 de décodage d'enveloppe.

**Contrainte d'exécution** : aucun toolchain Swift dans l'environnement de la routine — les gates
Swift sont la CI (`sdk-tests` macOS + `ios-tests`), pas une exécution locale.

## Cycle 114-bis — PR #2968 (même run)

*Renuméroté 114-bis à la fusion : une autre branche (`claude/keen-hamilton-dl8km4`) tournait en
parallèle et a livré son propre « cycle 115 » (`GET /sync` ouvert aux sessions anonymes, leçon 239),
mergé avant celui-ci. Les deux existent, ils ne se recouvrent pas.*

`fix(ios/sync): l'effectif d'une conversation dérivait à vie, l'effectif ABSOLU du serveur étant ignoré`

Trouvé en appliquant le réflexe que le cycle 114 venait de dégager (« quel champ le serveur
envoie-t-il que le client ne lit pas ? ») — deuxième instance de la MÊME classe de défaut, en
quelques minutes.

- Les 4 structs d'appartenance décodent `memberCount: Int?`.
- `ConversationListViewModel.memberCountAfterMembershipEvent(current:absolute:delta:)` pose
  l'absolu ; le delta n'est plus qu'un repli pour un gateway antérieur au contrat.
- L'absolu tranche `membershipEnded` / `membershipRestored` ; plancher à zéro sur les deux branches.
- CHANGELOG : entrée pour ce correctif, entrée pour le volet iOS du cycle 114, et retrait du
  « Reste ouvert : le client iOS » devenu faux.

TDD : 5 témoins de décodage SDK + 5 côté app.

## Reste ouvert (candidats des prochains cycles)

- **Auditer les PRESCRIPTIONS écrites dans `packages/shared/types/`** (voir leçon 238, corollaire de
  méthode). Les commentaires du type « à POSER, pas à incrémenter », « absent ⇒ `true` », « ne
  jamais soustraire » prescrivent un comportement CLIENT : chacun nomme un bug possible, et se
  vérifie par un grep du nom du champ chez chaque client. Deux instances trouvées en un run — la
  troisième est probablement déjà écrite quelque part.

- **Constat 2 ci-dessus** — masquage personnel au niveau message : décision produit à prendre.
- **`GET /sync`** — reste sans client ; le brancher côté iOS est un chantier à part entière
  (le SDK a son propre `ConversationSyncEngine` sur `/conversations?updatedSince=`).
- **Android** — aucun delta `updatedSince` ; pas d'écart symétrique à combler aujourd'hui.
- **`conversation:left` n'a pas de branche « c'est MOI qui suis parti »** (candidat prochain cycle) :
  `ConversationSyncEngine.startSocketRelay` n'y fait qu'un
  `cache.participants.invalidate(for:)` — le pendant TEMPS RÉEL du correctif de ce cycle manque
  donc. Un départ déclenché depuis un autre appareil ne retire la conversation de la liste qu'au
  prochain delta (ce que la PR #2966 rend enfin possible), pas immédiatement. `conversation:closed`
  et `conversation:deleted`, eux, ont bien leur branche de retrait — l'asymétrie est l'écart.
  À vérifier avant de coder : le device qui vient de quitter est-il encore dans la room au moment
  de l'émission (`emitToConversationParticipants`, `routes/conversations/leave.ts:91`) ? Si non,
  le canal correct est `broadcastToUser`, et le correctif est côté gateway.

## Review

Voir `tasks/lessons.md` → **Leçon 238** (un contrat livré et testé des deux côtés peut n'avoir
aucun récepteur sur une plateforme ; le type d'enveloppe comme point de coupure invisible ; le
retrait qui doit s'énumérer par magasin ; curseur persisté vs recalculé).

---

# Cycle 115 — le canal de rattrapage servait le trou qu'il devait boucher

*Le cycle 115 a repris le backlog d'audit (`docs/reviews/2026-08-01-ios-local-first-realtime/10-plan-d-application.md`),
où `gwcontract-03` (cycle 112) et son budget de poids (cycle 113) venaient de débloquer la seule
fiche gateway du Lot 7. Elle est livrée. Le lot du cycle 110 (badge APNs, `Mention`/`TrackingLink`)
reste intact et reconduit. Le cycle 114 (ci-dessus, volet iOS de `gwcontract-04`) a tourné en
PARALLÈLE de celui-ci sur une autre branche : son candidat `conversation:left` reste donc ouvert.*

> ## La leçon qui doit ouvrir chaque cycle, parce qu'elle a échoué TROIS fois (132, 137, 142)
>
> ```bash
> git fetch origin main && git log --oneline -5 origin/main
> ```
>
> **Avant chaque `Write`/`Edit` de production, et de toute façon si plus de ~15 min ont passé
> depuis le dernier fetch.**

> ## La leçon que le cycle 115 ajoute — la variable qui porte deux colonnes
>
> **`authContext.userId` porte un `User.id` pour un compte et un `Participant.id` pour une session
> anonyme.** La RLS de `/sync` filtrait `Participant.userId`, NULL pour tout anonyme : retirer le
> seul `allowAnonymous: false` aurait rendu une route qui répond **200 avec des streams vides**, sur
> le canal dont le métier est de dire ce qu'on a manqué. Pas d'erreur, pas de log — indiscernable
> d'un « rien n'a changé ».
>
> **Le symptôme à reconnaître** : une variable dont le NOM désigne une entité mais dont la VALEUR
> dépend de l'appelant. Remède : une union discriminée, pas un commentaire — elle oblige chaque
> lecteur à dire quelle colonne il interroge.
>
> **Corollaire — une fiche d'audit peut se tromper de mécanisme, et sa garde devient du code mort
> RASSURANT.** Deux des trois étapes prescrites par `gwcontract-09` étaient fausses (détail plus
> bas). Exécuter mentalement le chemin décrit sur le code réel AVANT d'écrire la garde qu'on vous
> dicte. Leçon 239, quatre corollaires.

## Livré au cycle 115 — `GET /sync` pour les sessions anonymes, et le plancher d'historique qu'il n'appliquait à personne

**Le défaut.** `/sync` rejetait les sessions anonymes (`allowAnonymous: false`) : un invité entré
par lien de partage n'avait AUCUN canal de rattrapage éditions/suppressions. Combiné à `net-02`
(sockets jamais relancés au resume, toujours ouvert, iOS-only), un invité voyait indéfiniment des
messages supprimés. Fiche `gwcontract-09`, P2, débloquée par `gwcontract-03` (cycle 112).

**Livré (gateway).** `services/shareLinkHistoryFloor.ts` (nouveau module) + `routes/sync.ts` :
- `SyncIdentity`, union discriminée `{kind:'user', userId} | {kind:'anonymous', participantId}` —
  la RLS interroge `Participant.id` pour un anonyme, `Participant.userId` pour un compte, et le
  `scope` reste une INTERSECTION dans les deux cas.
- Plancher d'historique des liens de partage (`allowViewHistory:false` ⇒ `createdAt >= joinedAt`)
  appliqué aux DEUX streams, `changed` et `deleted`.
- Tables personnelles (`UserMessageDeletion`, `UserConversationPreferences`, toutes deux attachées à
  `User`) court-circuitées pour un anonyme — idiome `userId: null` repris tel quel de `messages.ts`.
- `UserEventSeq` non interrogée pour un anonyme (`checkpointSeq = 0`).

**Les TROIS écarts vérifiés vs la fiche** (les deux premiers sont des erreurs de la fiche, corrigées
dans `06-reseau-et-contrat-gateway.md` au même commit) :
1. *Le crash annoncé n'existe pas.* `currentSeq` devait planter en « malformed ObjectID » sur le
   sessionToken. L'anonyme porte un `Participant.id` — ObjectId valide. La garde-pattern prescrite
   aurait été du code mort avec un test vert éternel. Le court-circuit reste pour la vraie raison :
   `UserEventSeq` est indexée par `User.id`.
2. *Le clamp prescrit ne fermait pas la fuite.* `sinceDate = max(sinceDate, joinedAt)` borne
   `updatedAt` ; un message d'avant la jointure **réédité** depuis le franchit avec tout son contenu.
   La borne est sur `createdAt`, la colonne exacte de `messages.ts`.
3. *La règle appartient à la LIGNE PARTICIPANT, pas au type d'identité.* Un utilisateur INSCRIT
   entré par un lien sans historique avait le même trou dans `/sync` — fermé par le même mécanisme.
   Le ranger sous « fiche sessions anonymes » l'aurait laissé ouvert.

**TDD.** 11 tests rouges d'abord (`sync.test.ts`, deux nouveaux `describe`) + 10 sur le module
(`shareLinkHistoryFloor.test.ts`). Mutation-proof : les 5 gardes cassées une à une, chacune fait
tomber EXACTEMENT son témoin (`allowAnonymous`, RLS par `id`, court-circuit `currentSeq`, plancher
sur le stream `deleted`, court-circuit du masquage) — aucune n'est portée par une autre.

**Gates.** `tsc --noEmit` propre ; suite gateway complète **710/710 suites, 17 344 tests** verts.

### Reste ouvert après ce cycle
- **`gwcontract-12` (nouveau, P3/S)** : `messages.ts` garde sa copie inline de la règle de plancher
  (il y ajoute les 403 `SHARE_LINK_EXPIRED`/`SHARE_LINK_MAX_USES`). Deux lecteurs d'une même règle —
  la famille de défauts des cycles 105-111. La convergence demande de séparer le FILTRE de la
  DÉCISION DE RÉPONSE, pas de les empiler.
- **`/sync` n'applique pas les 403 expiry/maxUses** qu'applique `GET messages` : un lien expiré
  garde son canal delta tant que la session reste `isActive`. Non traité ici (la fiche ne le demande
  pas, et c'est une décision de réponse, pas un filtre) — c'est l'objet de `gwcontract-12`.
- **`net-02` (P1, iOS)** : le volet client du même Lot 7. Non livrable depuis un runner Linux.
- **`sync-01`** : aucun client n'appelle encore `/sync` — l'impact de tout ce lot reste prospectif
  tant que le backfill iOS n'est pas câblé.
- Hérités : scope communauté de `user:preferences-updated` non routé côté iOS ; arbitrage
  `delete-for-me` du cycle 12 en attente de validation humaine.
