# Iteration 162 — Analyse d'optimisation (2026-07-12)

## Protocole (démarrage)
`main` @ `8d4883a` (dernier merge : PR #1896 — Android live-waveform pure core).
Branche `claude/brave-archimedes-ej12k8` recréée sur `origin/main` (0/0). Ce cycle
prend **162**.

PRs ouvertes au démarrage : seule **#1842** (dependabot `typescript`/`eslint`
bump). Toutes les PR des cycles précédents (159–161) sont mergées. Aucun conflit
de périmètre possible.

Fan-out : deux agents Explore parallèles — (a) `services/gateway/src`,
(b) `apps/web` + `packages/shared`. Consigne : **un** défaut de logique
quasi-pure, haute confiance, **actuellement en production**, non couvert par les
tests, hors des périmètres déjà traités (posts watch-time, stats participant,
notification unread, delivery/receipts, calls, mentions, translator queue,
presence). Priorité 1 = features récemment développées (notifications).

---

## Cible retenue : F131 — `NotificationService.isDNDActive` mis-keye le jour de la semaine pour les fenêtres DND nocturnes → notifications in-app supprimées le mauvais jour (et laissées passer le bon)

### Current state
`services/gateway/src/services/notifications/NotificationService.ts:561`.
`isDNDActive(prefs)` décide si le mode « Ne Pas Déranger » est actif. Elle gate la
création de **toute** notification in-app via `shouldCreateNotification` (l. 495 :
`if (this.isDNDActive(prefs)) return false;`) — chemin vif, pas de code mort.

L'ancien code testait le filtre `dndDays` contre le **jour courant**, **avant** de
calculer la fenêtre horaire :

```ts
const now = new Date();
if (prefs.dndDays && prefs.dndDays.length > 0) {
  const dayMap = ['sun','mon','tue','wed','thu','fri','sat'] as const;
  const today = dayMap[now.getUTCDay()];   // <-- jour COURANT
  if (!prefs.dndDays.includes(today as any)) return false;
}
const currentTime = ...;
if (start > end) return currentTime >= start || currentTime < end; // nocturne
return currentTime >= start && currentTime < end;
```

### Problems identified
Pour une fenêtre **nocturne** (`start > end`, ex. 22:00 → 08:00), la tranche du
**matin** (00:00 → end) appartient à la nuit qui a **commencé la veille**. Le filtre
`dndDays` doit donc être keyé sur le jour de **début** de la fenêtre, pas sur le
jour courant. L'ancien code faisait l'inverse :

- **Silence-quand-il-faut-notifier** : `dndDays=['mon']`, 22:00→08:00 (« nuit du
  lundi »). Mardi 02:00 = queue de la nuit du lundi → devrait être silencieux,
  mais `today='tue'` ∉ `['mon']` → `false` → **la notification est créée/poussée**.
- **Notifie-quand-il-faut-silence** : même prefs, lundi 02:00 = queue de la nuit du
  **dimanche** (non sélectionnée) → devrait notifier, mais `today='mon'` ∈ `['mon']`
  et `02:00 < 08:00` → `true` → **notification supprimée à tort**.

### Root cause
Divergence entre deux implémentations sœurs du même contrat DND. La jumelle
`PushNotificationService.isPushAllowed`
(`services/gateway/src/services/PushNotificationService.ts:303-321`) calcule
**d'abord** la fenêtre, puis keye `dndDays` sur le jour de début via
`inMorningTail = overnight && currentTime < end` →
`(getUTCDay() + 6) % 7`. Elle possède des tests explicites
(`PushNotificationService.test.ts:1997-2053`). `isDNDActive` est la jumelle
**non corrigée** — l'ordre inversé (jour avant fenêtre) rendait le décalage
impossible à rattraper.

### Business impact
DND est un réglage de confiance : promettre le silence puis pousser une notif
(ou l'inverse) casse la promesse produit précisément sur la tranche la plus
sensible (nuit). Auto-infligé pour tout utilisateur ayant configuré une fenêtre
nocturne **avec** des jours sélectionnés.

### Technical impact
Aucune donnée persistée corrompue — décision de gating pure. Mais l'effet est
**permanent** tant que la config reste (chaque matin de la fenêtre est mal
rattaché). Silencieux en observabilité (le log « bloquée par DND » ne dit rien du
mauvais rattachement).

### Risk assessment
Très faible. Le correctif recopie la logique **déjà en production et testée** de
la jumelle push. Aucun changement d'API, de schéma, de forme de réponse. Parité
stricte pour : DND désactivé, fenêtre diurne, fenêtre nocturne sans `dndDays`,
et fenêtre nocturne dont le jour de début EST sélectionné (soir). Seule la
tranche du matin change — dans le sens correct.

### Proposed improvement
Calculer `overnight`/`inWindow` d'abord ; early-return `false` hors fenêtre ; puis,
si `dndDays` non vide, keyer sur `windowStartDay` (jour courant, ou jour −1 dans la
tranche du matin d'une fenêtre nocturne). Convergence exacte avec `isPushAllowed`.

### Expected benefits
- DND nocturne correct : le matin est rattaché à la nuit qui l'a commencé.
- Convergence des deux chemins DND (in-app + push) vers un contrat de keying unique
  → plus de dérive possible de cette classe.

### Implementation complexity
Triviale — ~10 lignes de prod (réordonnancement + keying jour de début), 3 tests
unitaires purs (fake timers, mock Prisma déjà en place).

### Validation criteria
- **RED d'abord** (vérifié par lecture de l'ancien code) :
  - Mardi 02:00, `dndDays=['mon']`, 22:00→08:00 → doit être `true` (ancien : `false`).
  - Lundi 02:00, `dndDays=['mon']`, 22:00→08:00 → doit être `false` (ancien : `true`).
- Régression : soir (lundi 23:00) reste `true` ; diurne et nocturne-sans-dndDays
  inchangés.
- Suite `NotificationService.uncovered-paths.test.ts` verte.

### Tests — absence de couverture confirmée
`NotificationService.uncovered-paths.test.ts` : les tests `dndDays` (l. 410-440)
utilisent `00:00`/`23:59` (fenêtre **diurne** `start < end`, branche nocturne jamais
prise) ; les tests `isDNDActive` nocturnes (l. 541-555) utilisent `dndDays: null`
(filtre jour sauté). Aucun test ne combinait fenêtre nocturne **+** `dndDays` à un
instant de tranche-matin. 3 tests ajoutés (matin sélectionné, matin non sélectionné,
soir).

---

## Candidats écartés ce cycle (backlog documenté)
- **`utils/pagination.ts:51` `hasMore: resultCount === limit`** — une page finale
  pleine (exactement `limit` lignes, sans reliquat) signale `hasMore:true` → un
  fetch vide superflu. Correctif robuste = probe `take: limit + 1` à chaque call
  site (plus invasif). Gaspille un aller-retour, ne corrompt pas de donnée →
  reporté à un cycle dédié.
- **`routes/admin/messages.ts:262` `/trends`** — `getHours()`/`getDay()` en heure
  **locale** serveur alors que le reste du code keye les buckets en UTC. Latent
  (les conteneurs prod tournent en UTC) plutôt que défini-faux aujourd'hui →
  reporté.
