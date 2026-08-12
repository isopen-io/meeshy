# Iteration 181 — `deviceLocale` middleware : cache de debounce non borné (fuite mémoire par utilisateur distinct)

## Protocole (démarrage)
`main` @ `b158a9b` (derniers merges : #2055/#2052/#2050 android/status, #2044
web/i18n normalize codes, #2037 ios/a11y…). Branche
`claude/brave-archimedes-q76pfd` réinitialisée sur `origin/main`. Ce cycle prend
**181**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared). Les PR iOS ouvertes (#2040→#2056) sont pilotées par
d'autres sessions et hors périmètre. Point de départ : **revue Priorité 1**
(fonctionnalités récentes) sur la surface gateway TS — le middleware
`deviceLocale` (Prisme étendu 2026-05-26) est l'ajout serveur récent le plus
directement testable.

## Current state
`services/gateway/src/middleware/deviceLocale.ts` persiste opportunément la locale
appareil (`X-Device-Locale`) dans `User.deviceLocale`, avec un **debounce
par utilisateur de 5 min** implémenté par une `Map` de processus :

```ts
const DEBOUNCE_MS = 5 * 60 * 1000;
const lastUpdateByUserId = new Map<string, number>();  // userId → last write ts
// ...
lastUpdateByUserId.set(userId, now);   // ← une entrée par utilisateur, jamais évincée
```

Le hook est un `preHandler` **global** : il s'exécute sur **chaque requête
authentifiée** de **chaque route**. La `Map` reçoit donc une entrée pour tout
utilisateur enregistré ayant émis au moins une requête portant `X-Device-Locale`.

## Problems identified
1. **Fuite mémoire non bornée (scalabilité).** `lastUpdateByUserId` n'est
   **jamais purgée**. Elle accumule une entrée par utilisateur distinct pour
   **toute la durée de vie du process gateway**. Sur une plateforme visée à
   100k+ utilisateurs (et une gateway à long uptime), la `Map` croît linéairement
   avec le nombre cumulé d'utilisateurs actifs — ~100k entrées ≈ ~10 Mo, 1M ≈
   ~100 Mo — sans plafond. C'est une fuite lente mais réelle.
2. **Entrées mortes conservées.** Une entrée dont l'horodatage dépasse
   `DEBOUNCE_MS` ne peut **plus jamais** supprimer une écriture (la garde
   `now - last < DEBOUNCE_MS` échoue toujours pour elle). Elle est donc du poids
   mort pur : la conserver n'apporte rien mais coûte de la mémoire.

## Root cause
Le debounce a été conçu pour la **correction fonctionnelle** (ne pas marteler la
DB) sans stratégie d'éviction : la `Map` est un cache qui **grandit mais ne
rétrécit jamais**. Le cycle de vie d'une entrée (utile seulement pendant
`DEBOUNCE_MS` après sa dernière écriture) n'était pas exploité pour la libérer.

## Business / Technical impact
- **Mémoire / scalabilité (serveur)** : empreinte du process qui croît de façon
  monotone avec la base d'utilisateurs cumulée — pression GC accrue, risque
  d'OOM sur un uptime long, coût RAM en production.
- **Observabilité** : une croissance mémoire lente et diffuse est difficile à
  diagnostiquer ; la borner par construction supprime une classe entière de
  faux positifs d'investigation.
- **Correctness** : inchangée — le debounce reste strictement identique tant que
  la `Map` est sous le plafond.

## Risk assessment
Très faible. Aucune signature publique ni type de retour modifié. La purge
n'évince que des entrées **expirées** (comportement strictement préservé : elles
ne pouvaient plus supprimer d'écriture). Le plafond dur (`MAX_TRACKED_USERS =
10_000`) ne se déclenche que si >10k utilisateurs distincts écrivent **dans la
même fenêtre de 5 min** — cas pathologique où le seul effet est **une** écriture
`User.update` supplémentaire (idempotente) pour un utilisateur évincé. La purge
est **amortie** (déclenchée uniquement au franchissement du plafond, jamais sur
le chemin chaud nominal). Les 14 tests existants restent verts.

## Proposed improvements / Correctif (TDD)
- **RED** : +3 tests (`deviceLocale.test.ts`, bloc « bounded debounce cache ») —
  (a) éviction des entrées expirées au franchissement du plafond ; (b) borne dure
  respectée même quand toutes les entrées sont fraîches ; (c) pas de purge sous le
  plafond (amortissement, pas d'éviction eager). Nouveaux seams de test
  `_deviceLocaleCacheSize()` / `_DEVICE_LOCALE_MAX_TRACKED_USERS`.
- **GREEN** :
  1. `MAX_TRACKED_USERS = 10_000` + `pruneStaleDebounceEntries(now)` : balaye les
     entrées `now - ts >= DEBOUNCE_MS` puis, si toujours au plafond, évince les
     plus anciennement insérées (ordre d'insertion `Map`).
  2. Chemin d'écriture : avant `set`, si l'utilisateur est nouveau **et** la
     `Map` a atteint le plafond, déclencher la purge. Le hot path nominal (map
     sous plafond) ne paie aucun coût O(n).

## Expected benefits
- Empreinte mémoire du middleware **bornée par construction** (≤
  `MAX_TRACKED_USERS` entrées) quelle que soit la base d'utilisateurs cumulée.
- Élimination d'une fuite mémoire lente sur une fonctionnalité récente.
- Debounce fonctionnellement inchangé sous charge nominale.

## Implementation complexity
Faible — 1 constante + 1 fonction de purge amortie + 1 garde sur le chemin
d'écriture, dans un seul fichier déjà couvert par tests.

## Validation criteria
- `services/gateway` : `deviceLocale.test.ts` **17/17** verts (3 nouveaux, 14
  préexistants inchangés).
- `tsc --noEmit` : 0 nouvelle erreur sur les lignes touchées.

## Backlog (candidats consignés pour une itération future)
- `MeeshySocketIOManager.ts:752` — ordre de résolution différent
  (`username ?? displayName ?? …`, sémantique « présence key ») : hors périmètre,
  à ne PAS uniformiser sans analyse dédiée.
- F69 (`sanitizeFileName` overlong sans extension) : latent, 0 appelant.
