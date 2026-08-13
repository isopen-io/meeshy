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

## Reste ouvert (candidats des prochains cycles)

- **Constat 2 ci-dessus** — masquage personnel au niveau message : décision produit à prendre.
- **`GET /sync`** — reste sans client ; le brancher côté iOS est un chantier à part entière
  (le SDK a son propre `ConversationSyncEngine` sur `/conversations?updatedSince=`).
- **Android** — aucun delta `updatedSince` ; pas d'écart symétrique à combler aujourd'hui.

## Review

Voir `tasks/lessons.md` → **Leçon 238** (un contrat livré et testé des deux côtés peut n'avoir
aucun récepteur sur une plateforme ; le type d'enveloppe comme point de coupure invisible ; le
retrait qui doit s'énumérer par magasin ; curseur persisté vs recalculé).
