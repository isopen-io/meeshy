# Cycle 20 — La boîte d'envoi web n'est ni durable ni ordonnée

Routine « amélioration continue temps réel ». Le cycle 19 (PR #3004) a fermé les
trois derniers candidats du cycle 17. Des quatre dettes qu'il laisse nommées,
trois demandent un toolchain Swift (absent de ce runner) et la quatrième
(`deletedForUserAt` / `clearHistoryBefore` hors sérialiseur REST) n'a aucun
lecteur sur cette surface. Ce cycle repart donc d'un relevé neuf sur la **chaîne
d'envoi web** (Phases 3 et 4), qu'aucun cycle n'avait tracée de bout en bout.

## Constats

**D1 — le vidage de la file d'envoi n'évaluait la liaison qu'une fois.**
`processPendingMessages()` lisait `getSocket()` en tête de fonction puis
parcourait la file entière. Or la file n'existe QUE parce que le lien a déjà
lâché une fois : un lien qui vient de revenir est celui qui peut relâcher au
milieu du vidage. Le tour suivant appelait alors l'envoi avec un socket mort,
qui rend `{ success: false }` **sans rien émettre**. Le reliquat — déjà
`shift()`é, minuterie déjà annulée — s'effondrait d'un bloc en une rafale
d'échecs dont aucune tentative n'avait quitté l'onglet. Tout l'envoi vire au
rouge d'un coup pour une microcoupure, chaque message perdant le solde de son
budget de deux minutes.

**D2 — le chemin d'envoi direct pouvait doubler la file.**
Le choix « direct ou file » ne regardait que la liaison, jamais le reliquat. Un
message tapé pendant le vidage — ou entre la reconnexion du socket et son
authentification, qui est ce qui DÉCLENCHE le vidage — partait avant des
messages plus anciens encore en attente. L'horodatage serveur entérine
l'inversion : aucune relecture ne la corrige.

## Correctifs

- [x] D1 — liaison réévaluée à CHAQUE tour, avant le `shift()`
- [x] D1 — sur lien mort, sortie du vidage ; le reliquat reste en file, minuteries armées
- [x] D1 — `isProcessingQueue` sous `try/finally` (la sortie anticipée est un chemin normal)
- [x] D1 — une tentative RÉELLE reste terminale (pas de boucle sur lien vivant)
- [x] D2 — file non vide ⇒ on entre par la queue, liaison vivante ou non
- [x] D2 — relance immédiate du vidage quand la mise en file est due à l'ordre seul

## Gates

- [x] 5 tests RED d'abord, verts après
- [x] `orchestrator.service.test.ts` : 114 verts (109 pré-existants inchangés)
- [x] suite web complète verte
- [x] `tsc --noEmit` web : base pré-existante inchangée (1229), zéro sur le fichier touché
- [x] CHANGELOG + journal d'audit + leçon 254

## Revue

Voir `tasks/realtime-sync-audit-2026-07-11.md` § Cycle 20.

---
