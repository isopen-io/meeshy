# Itération 285 — les tâches périodiques de `MaintenanceService` gardent leur rejet (`setInterval(async)` → forme bénie non-async + `.catch`)

Solde une divergence de la règle la plus ratchetée du gateway — celle des
promesses détachées (leçon 230/307, `services/gateway/CLAUDE.md` § Critical
Gotchas) — sur le SEUL service du dépôt qui la contredisait, et sur le PROCESS
CŒUR (la passerelle), pas sur un job périphérique.

## État actuel (avant correctif)

`MaintenanceService.startMaintenanceTasks` armait ses DEUX tâches périodiques
sous la forme `setInterval(async () => { await … })` :

```ts
this.maintenanceInterval = setInterval(async () => {
  logger.debug('🔄 Exécution de la tâche de maintenance automatique...');
  await this.updateOfflineUsers();          // ← rejet DÉTACHÉ, le timer ne l'attend pas
}, 15000);
...
this.dailyCleanupInterval = setInterval(async () => {
  await this.runDailyCleanup();             // ← idem
}, 60 * 60 * 1000);
```

Un `setInterval`/`setTimeout` **n'attend jamais son callback** : le rejet de la
promesse rendue par le callback async n'a aucun `try/catch` englobant où être
vu. Sous le `--unhandled-rejections=throw` par défaut de Node 22, un tel rejet
**termine le process** — toute la passerelle (sockets, messages, traductions,
appels en vol) tombée pour une passe de maintenance best-effort.

Tous les services frères arment leurs tâches périodiques par la forme BÉNIE —
un callback **non-async** + un `.catch` explicite :

- `ExpiredMessagesCleanupService.ts:152` :
  `setInterval(() => { void this.cleanup().catch((err) => log.warn(…)); }, …)`
- `CallService.ts:599` :
  `setTimeout(() => { void this.persistHeartbeatToDb(…).catch(…) }, …)` — son
  commentaire cite explicitement la leçon 230.

`MaintenanceService` était la seule divergence (mesuré :
`grep -rE 'set(Interval|Timeout|Immediate)\s*\(\s*async' src` rend exactement ces
deux sites ; le seul autre, `MessageTranslationService.ts:292`
`setImmediate(async …)`, enveloppe TOUT son corps dans un `try/catch` — aucun
`await` hors du try — et est donc déjà sûr).

## Problèmes identifiés

1. **Rejet détaché non gardé sur le process cœur.** Le callback async d'un timer
   est exactement la « forme la plus chère » que le `CLAUDE.md` nomme (« Cinq des
   quatorze [contre-exemples du cycle 130 bis] vivaient dans un `setTimeout` … :
   aucun `try/catch` englobant à invoquer »). Ici sur la passerelle, pas sur un
   canal périphérique.
2. **Jumelle divergente d'un invariant ratcheté.** Deux services frères
   appliquent la forme bénie ; `MaintenanceService` la contredisait. Le cliquet
   existant (`detached-promise-catch-sweep.ts`) cherche `void p` sans `.catch` —
   une GRAMMAIRE que la forme `setInterval(async)` ne présente pas, d'où sa survie
   (leçon 261 : « une énumération de sites porte deux affirmations … la grammaire
   du site est l'axe le long duquel la seconde a lâché »).

## Causes racines

Latent, pas live aujourd'hui : `updateOfflineUsers` (`:171`) et `runDailyCleanup`
(`:381`) enveloppent leur corps dans un `try/catch` qui avale. MAIS c'est
précisément le raisonnement que la leçon 230 interdit — « ne jamais raisonner
*le callee avale ses erreurs* : c'est une propriété du collaborateur, pas une
garantie du site d'appel, et elle est fausse dès que le callee a UNE instruction
non gardée avant son propre `.catch` ». La première instruction non gardée ajoutée
à l'une de ces méthodes — ou un remaniement de leur catch — fait tomber le
process cœur, sans qu'aucun témoin ne rougisse.

## Impact métier / technique

Aujourd'hui : piège armé, pas panne (règle du cycle 84 : on ne laisse pas un
piège armé au motif que personne n'a encore marché dessus). Demain : un rejet non
gardé dans la passe des 15 s (la plus fréquente) arrête la passerelle entière.
Dimension 1 (sécurité/robustesse — garde fail-closed sur le process),
dimension 3 (mémoire/stabilité), dimension 11 (maintenabilité — UNE forme unique
pour armer une tâche périodique).

## Évaluation du risque

Très faible. Le correctif est mécanique et REPRODUIT à l'identique la forme déjà
en production dans deux services frères : callback non-async, `void … .catch(err
=> logger.error(…))`. Le comportement nominal est inchangé (les mêmes méthodes
sont appelées, aux mêmes intervalles) ; seul le chemin d'ERREUR change — un rejet
est désormais journalisé au lieu d'arrêter le process.

## Améliorations proposées (implémentées)

- `MaintenanceService.startMaintenanceTasks` : les deux `setInterval(async () =>
  { await … })` deviennent `setInterval(() => { void … .catch(err =>
  logger.error(…)) })`, avec un commentaire citant la leçon 230/307 et la forme
  bénie des services frères.

## Bénéfices attendus

Un échec d'une tâche de maintenance périodique est journalisé (`logger.error`) au
lieu de terminer le process. Le gateway ne peut plus tomber pour une passe
best-effort. La forme unique d'armement d'une tâche périodique est rétablie sur
les trois services concernés.

## Complexité

Faible : deux lignes de production (callbacks), un fichier de tests.

## Critères de validation (atteints)

- **RED prouvé au RUNTIME** : `captureUnhandledRejections` (le patron blessé du
  dépôt — écoute de `process.on('unhandledRejection')` + franchissement de la
  phase « check ») capture le rejet `boom-maintenance` / `boom-daily` sur le code
  courant, et `logger.error` n'est jamais appelé (aucun `.catch`). Les deux
  témoins tombent.
- **GREEN** : `MaintenanceService.test.ts` — 28/28 verts (26 anciens + 2 neufs).
- `detached-promise-catch-sweep.test.ts` : inventaire toujours VIDE (le `.catch`
  ajouté garde les deux nouvelles promesses détachées).
- `tsc --noEmit -p tsconfig.json` : EXIT=0.

## Dimensions (roadmap treize dimensions)

**1 · Sécurité/robustesse** (mûre : garde fail-safe sur le process cœur) —
**3 · Optimisation mémoire/stabilité** (mûre : plus d'arrêt de process sur rejet
best-effort) — **11 · Maintenabilité** (mûre : forme unique d'armement d'une
tâche périodique, alignée sur les deux services frères).

## Suivi (hors périmètre)

- Le cliquet `detached-promise-catch-sweep.ts` ne voit PAS la forme
  `set(Interval|Timeout)(async () => { await … })` (grammaire différente de
  `void p`). Un balayage NAÏF de cette forme rendrait un faux positif sur
  `MessageTranslationService.ts:292` (`setImmediate(async)` sûr, corps
  entièrement try/wrappé) — la propriété gardée n'est pas « pas de
  `set*(async)` » mais « pas d'`await` hors try dans un callback de timer »,
  qui n'est pas grep-able sans un typeur. Faute d'un cliquet honnête (mesurerait
  la popularité d'un idiome, pas une propriété — cycle 107), la garde reste le
  témoin de comportement de cette itération. À ré-outiller si la forme réapparaît.
