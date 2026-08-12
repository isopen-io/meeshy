# Iteration 160 — Analyse d'optimisation (2026-07-10)

## Protocole (démarrage)
`main` @ `2daf985` (dernier merge : PR #1780 iter — re-entrant Accept double
`getUserMedia` leak web + lost reconnect grace gateway). Branche
`claude/brave-archimedes-c9xp59` recréée sur `origin/main` (0/0). Ce cycle prend
**160** (159 est pris par la PR ouverte #1781, stats edit/delete keying).

PRs ouvertes au démarrage (autres sessions, hors périmètre autonome) : #1783
(web dead useWebRTC), #1782 (Android live-translation merge), #1781 (gateway stats
keying), #1778 (translator FIFO), #1775 / #1772 (web mentions), #1771 (web calls
shared-stream). Aucune ne touche `PostService.recordView` → pas de conflit.

Fan-out : un agent Explore ciblé sur `services/gateway/src` (delivery queue,
post/story views, pagination, sorts lexicographiques, clés de map à fallback
vide). Consigne : **un** défaut de logique quasi-pure, haute confiance,
**actuellement en production**, non couvert par les tests. Priorité 1 = features
récemment développées (le feed social / stories est en évolution active).

## État actuel
`PostService.recordView(postId, userId, duration?)`
(`services/gateway/src/services/PostService.ts:996`) enregistre une vue de post /
story. Le `PostView` est un **singleton** par `(postId, userId)` (index unique
`@@unique([postId, userId])`) : chaque ré-ouverture retombe sur la même ligne,
`recordView` retourne `false` et n'incrémente pas `viewCount`. Le champ
`duration Int?` (« Durée de vue en ms ») est le **signal watch-time** consommé par
le moteur de reco/monétisation (`PostFeedService.ts:434`).

Sur ré-ouverture, l'ancien code écrasait **inconditionnellement** la durée
persistée par la dernière valeur fournie :

```ts
if (existing) {
  if (safeDuration !== undefined) {
    await this.prisma.postView.update({
      where: { id: existing.id },
      data: { duration: safeDuration },   // last-writer-wins, même plus court
    });
  }
  return false;
}
```

## Problème identifié
**Rétrogradation du watch-time (perte de donnée) au dernier écrivain.**
Le champ singleton représente l'engagement total de l'utilisateur sur le post,
mais une ré-ouverture plus **courte** écrase la durée plus **longue** déjà
observée.

## Cause racine
`data: { duration: safeDuration }` applique un *last-writer-wins* sans comparer à
la valeur déjà persistée. Aucun test n'exerçait la branche `existing` : le mock
`postView.findUnique` de `posts-view-idempotence.test.ts` renvoyait toujours
`null` (chemin création uniquement).

## Scénario input → output erroné
1. `recordView(P, U, 30000)` → crée la ligne, `duration = 30000` (story de 30s
   regardée en entier).
2. `recordView(P, U, 500)` (l'utilisateur retape la story et swipe aussitôt) →
   la ligne est mise à jour à `duration = 500`.

Le watch-time persisté chute de **30000 ms → 500 ms**. Le signal reco/monétisation
est monotone-décroissant, corrompu par une interaction triviale.

## Impact métier
Sous-estimation du watch-time → ranking / monétisation faussés (un contenu
réellement regardé apparaît sous-engageant). Auto-infligé par tout re-tap.

## Impact technique
Corruption silencieuse d'un champ analytique. Pas de crash, pas d'erreur — donc
invisible en observabilité. Se cumule sur toute la base d'utilisateurs actifs.

## Évaluation du risque
**Faible.** Fix de 3 lignes, localisé à la seule branche `existing`. Aucun
changement de contrat externe, de schéma, ni de forme de réponse. Pour le cas
courant (première vue = la plus longue), le comportement observable est identique
(la valeur ne change pas) — et l'écriture Room redondante est désormais évitée.

## Améliorations proposées
Conserver le **max** de la durée observée (`Math.max(existing.duration ?? 0,
safeDuration)`) — le fix minimal, non-inventif : il préserve l'intention
« enregistrer la durée de vue » sans introduire de sémantique `sum` (qui
sur-compterait les replays et gonflerait le signal). Skip l'écriture quand la
valeur est inchangée (efficience : la ré-ouverture courante — la plus fréquente —
n'émet plus d'`update` inutile).

## Bénéfices attendus
- Watch-time monotone-non-décroissant, fidèle à l'engagement réel.
- Une écriture DB en moins par ré-ouverture non-améliorante (cas dominant).
- Aucune régression : parité stricte pour la première vue et les ré-ouvertures
  plus longues.

## Complexité d'implémentation
Triviale — 3 lignes de production, 3 tests unitaires purs (mock Prisma).

## Critères de validation
- RED : sans le fix, « ré-ouverture plus courte : aucune écriture » échoue
  (l'ancien code appelle `update` avec `duration: 500`). ✅ vérifié.
- GREEN : `posts-view-idempotence.test.ts` 6/6 ; suites `posts` 45/45 (930 tests).
  ✅
- `tsc --noEmit` : aucune nouvelle erreur sur `PostService.ts` /
  `posts-view-idempotence.test.ts` (les erreurs `magic-link.ts` préexistent). ✅

## Candidats écartés ce cycle (backlog documenté)
- **Pagination `hasMore: resultCount === limit`** (`utils/pagination.ts:51`) — une
  page pleine sans reliquat signale `hasMore: true` (une page vide superflue).
  Corriger proprement demande un probe `take: limit + 1` à chaque call site (DB
  queries), donc plus invasif — reporté à un cycle dédié.
- **Sort lexicographique** (`routes/conversations/stats.ts:86`,
  `a.date.localeCompare(b.date)`) — correct **si** les clés `date` sont des
  `YYYY-MM-DD` zero-paddés ; à confirmer côté formateur amont avant tout
  changement. Reporté.
