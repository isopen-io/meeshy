# Tête instruite pour le cycle 115 — le canal de rattrapage servait le trou qu'il devait boucher

*Le cycle 114 a repris le backlog d'audit (`docs/reviews/2026-08-01-ios-local-first-realtime/10-plan-d-application.md`),
où `gwcontract-03` (cycle 112) et son budget de poids (cycle 113) venaient de débloquer la seule
fiche gateway du Lot 7. Elle est livrée. Le lot du cycle 110 (badge APNs, `Mention`/`TrackingLink`)
reste intact et reconduit.*

> ## La leçon qui doit ouvrir chaque cycle, parce qu'elle a échoué TROIS fois (132, 137, 142)
>
> ```bash
> git fetch origin main && git log --oneline -5 origin/main
> ```
>
> **Avant chaque `Write`/`Edit` de production, et de toute façon si plus de ~15 min ont passé
> depuis le dernier fetch.**

> ## La leçon que le cycle 114 ajoute — la variable qui porte deux colonnes
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
> dicte. Leçon 238, quatre corollaires.

## Livré au cycle 114 — `GET /sync` pour les sessions anonymes, et le plancher d'historique qu'il n'appliquait à personne

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
