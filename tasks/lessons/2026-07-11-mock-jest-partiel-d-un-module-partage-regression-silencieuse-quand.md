## 2026-07-11 — Mock jest PARTIEL d'un module partagé = régression silencieuse quand la prod consomme un nouvel export

La migration des literals `socket.on('presence:app-state')` vers `CLIENT_EVENTS.PRESENCE_APP_STATE`
a cassé 227 tests en CI (`a7280bcf9`) : la suite legacy `src/socketio/__tests__/CallEventsHandler.test.ts`
mockait `@meeshy/shared/types/socketio-events` en n'exportant QUE `ROOMS` → `CLIENT_EVENTS` undefined
→ `setupCallEvents` crashait au premier `socket.on`. Vérification locale faite uniquement sur
`src/__tests__/unit/socketio/` + tsc : la suite fautive vit dans `src/socketio/__tests__/` (autre dossier).

**Règles** :
- Avant de pousser un changement gateway qui touche un module PARTAGÉ (shared types/utils) : grep
  `jest.mock('@meeshy/shared/...')` sur les deux arbres de tests (`src/__tests__/` ET `src/*/__tests__/`)
  — tout mock partiel du module modifié doit exposer les nouveaux exports (ou `jest.requireActual`).
- « Suite socketio verte » ≠ « gateway vert » : les tests CallEventsHandler existent dans DEUX dossiers.
  Le gate pré-push d'un changement handler = `bun run jest Call` minimum, suite complète si le diff
  touche packages/shared.
- tsc ne voit RIEN ici : le mock est un objet runtime. Seule l'exécution des suites attrape ce trou.

**Corollaire (2026-08-08, cycle 25) — la règle vaut aussi pour un service INTERNE, et une
délégation la déclenche.** Collapser une copie d'algorithme en délégation fait appeler, depuis ce
chemin, une méthode que personne n'y appelait : aucun double du service ne l'expose. Le piège est
silencieux par construction quand l'appelant est best-effort — la méthode absente vaut `undefined`,
l'appel lève, le catch avale, le contenu ressort brut. Rien ne casse bruyamment ; seule une
assertion « l'accès base a-t-il eu lieu » échoue. DEUX fichiers doublaient ici le même
`TrackingLinkService` (`MessageProcessor.test.ts` ET `MessagingService.test.ts`) ; corriger le
premier a suffi à verdir la suite CIBLÉE, et seule la suite COMPLÈTE (~3 min) a sorti les 2 échecs
du second. Ne jamais conclure une délégation sur une suite ciblée.

**Corollaire — face au `undefined`, doubler l'algorithme est le mauvais remède.** La tentation est
d'ajouter un `jest.fn()` renvoyant un résultat plausible : cela produit un TROISIÈME exemplaire de
ce qu'on vient de dédupliquer. Deux issues correctes, selon ce que le test décrit : monter la VRAIE
méthode (`jest.requireActual(...).Klass.prototype.method`) sur un objet dont seuls les accès base
restent doublés — les tests exercent alors l'algorithme partagé ; ou bien assumer que le test ne
décrit plus que la DÉLÉGATION, le doubler par une identité, et déménager la couverture de
l'algorithme vers la suite de son propriétaire. Ce qu'il ne faut pas, c'est un double qui
RÉIMPLÉMENTE.
