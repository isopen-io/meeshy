## Leçon 16 — Un invariant lossless documenté sur une méthode n'est pas propagé à son sibling (2026-07-03, itération 89)
`getFeed` (PostFeedService) porte un invariant de pagination **explicitement commenté** : `candidateLimit
= limit + 1`, fenêtre chronologique + sonde, *« We deliberately do NOT over-fetch then drop »* — curseur
pris sur le post chronologiquement le plus ancien AVANT le tri par score. Le sibling `getReels`, écrit
avec le même moteur de scoring, a gardé le pattern inverse (`limit * 4` sur-fetch, score tout, curseur
sur l'item score-trié) → réels sautés/re-servis en scroll infini. **Règle : quand un fix documente un
invariant dans un commentaire load-bearing sur une méthode, grep les siblings à même forme (`getFeed`
vs `getReels` vs `getStories` vs `getStatuses`) et vérifier que l'invariant y est appliqué — un
commentaire précis sur UNE méthode ne prouve rien sur ses jumelles.** Variante #40/#42/#45/#50/#55/#56/#57.
Corollaire validation : un test préexistant peut **encoder le comportement bogué** (ici `take === 20`
= le pool `limit×4`) — le recadrer sur l'invariant corrigé fait partie du fix, ne pas le contourner.
