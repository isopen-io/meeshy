# Iteration 70 — Analyse d'optimisation (2026-07-01)

## Protocole (démarrage) — OK
`main` réaligné (`026b2bb0`, force-update détecté vs branche de travail iter 69). Branche de travail
recréée depuis `origin/main`.

**Contrainte environnement (inchangée vs iter 69)** : le client Prisma reste **non générable localement**
(le postinstall `@prisma/engines` échoue en `ECONNRESET` — CDN des binaires bloqué par le proxy ;
`binaries.prisma.sh` répond 404/reset). Le type-check et les tests **gateway** ne sont donc **pas
vérifiables** en local. Surfaces vérifiables : **apps/web** (`tsc --noEmit` baseline **1198 erreurs**
pré-existantes, identique iter 68/69 → aucune dérive ; `jest` sans Prisma) et **packages/shared**
(compile sans Prisma).

Conséquence : la cible iter 70 est choisie **dans apps/web**, vérifiable localement, CI garantie verte.

## Choix de cible — axe « bande passante + fluidité + exploitation des API natives »
Le user priorise la **bande passante**, la **fluidité réelle** et l'**exploitation des frameworks/API**
(navigateur inclus). Le plus gros gain bande passante du backlog reste **F2** (`SOCKET_LANG_FILTER` OFF
par défaut, ~75 % de poids multilingue broadcasté inutilement) — infra **complète et testée**, mais le
flip du défaut est une **décision produit/staging** et le code est **gateway (non vérifiable local)** →
maintenu en backlog.

Cible retenue, vérifiable et à réel impact correctness+UX+bande passante :
**annulation des requêtes de validation obsolètes via `AbortController`** dans le flux d'inscription.

### Constat — race condition dans `useFieldValidation` (chemin critique d'inscription)
`apps/web/hooks/use-field-validation.ts` valide la disponibilité de `username`/`email`/`phone` en frappe :
un `setTimeout` de **2000 ms** débonce, puis `checkAvailability(value)` fait un `fetch` vers
`/auth/check-availability`. Problèmes :

1. **Race condition (last-write-wins)** : le cleanup de l'effet ne nettoie **que le timeout**, jamais le
   `fetch` déjà parti. Deux vérifications peuvent chevaucher (valeur `ab` puis `abc` sur réseau lent) ;
   la réponse **la plus lente arrive en dernier** et **écrase** l'état de validation de la valeur
   **courante** — l'utilisateur voit un état « taken/available » correspondant à une saisie périmée.
2. **`setState` post-démontage** : le `fetch` continue après navigation hors de la page → warning React
   + travail gâché.
3. **Bande passante** : aucune requête en vol n'est annulée quand la valeur change → requêtes zombies.

`AbortController` (API navigateur native, zéro dépendance) résout les trois d'un coup.

## Cible iter 70 — `AbortController` sur la vérification de disponibilité

### Conception (préservation de comportement, chirurgical)
1. **`abortRef = useRef<AbortController | null>(null)`**.
2. `checkAvailability` : `abortRef.current?.abort()` (annule la précédente) → nouveau controller →
   `fetch(url, { signal })` → gardes `if (controller.signal.aborted) return;` après le `fetch` et après
   le `json()`.
3. `catch` : `if ((error as Error)?.name === 'AbortError') return;` **avant** de dégrader l'état en
   `invalid` — une annulation ne doit jamais afficher une erreur réseau.
4. Cleanup de l'effet (`[value, disabled, …]`) : `abortRef.current?.abort()` (changement de valeur /
   démontage).

Comportement nominal (une seule frappe stabilisée, réseau normal) **strictement identique** : le premier
et unique controller n'est jamais annulé, la réponse est traitée comme avant.

### Pourquoi ce choix (vs candidats explorés)
Un agent d'exploration a classé 3 cibles (toutes « AbortController/debounce manquant ») :
- **#2 `useFieldValidation`** (retenu) : corrige une **vraie race condition** sur le **chemin critique
  d'inscription** (pas juste du gaspillage) + bande passante + post-démontage. Testable proprement.
- #1 `usePrefetch` (fetch de prefetch au hover sans `AbortController`) : gain réel mais best-effort ;
  la résolution d'un prefetch obsolète est **inoffensive** (positionne juste un booléen). → backlog F33.
- #3 `useContactsFiltering` : hook **`@deprecated`** (remplacé par `useContactsV2` qui débonce déjà) —
  optimiser = surtout du cleanup/suppression, risque plus élevé. → backlog F34.

## Consignés pour itérations futures

| # | Constat | Impact |
|---|---------|--------|
| **F2** | `SOCKET_LANG_FILTER` OFF par défaut (infra B1+B3 complète + testée, mesure `[lang-filter]` prête) | HAUT (~75 % bande passante multilingue) — flip = validation staging/produit, gateway non vérifiable local |
| **F33** | `usePrefetch.prefetchDataFn` : `fetch` de prefetch au hover sans `AbortController` | FAIBLE-MOYEN (best-effort, race inoffensive) |
| **F34** | `useContactsFiltering` (`@deprecated`) : `handleSearchChange` sans debounce/abort — migrer les appelants restants vers `useContactsV2` puis supprimer | MOYEN (cleanup + suppression) |
| F32 | Regex ObjectId dupliquée **gateway** (~25 sites) → SSOT | MOYEN-HAUT (non vérifiable local, Prisma) |
| F31 / F25b / F26c | Collisions de noms / modules à sémantiques divergentes | ne pas fusionner mécaniquement |
| F30 (reste) | ~8 sites `navigator.clipboard.writeText` bruts | MOYEN |

## Gain
Le flux d'inscription n'affiche plus jamais un état de validation issu d'une réponse périmée
(race éliminée), n'exécute plus de `setState` post-démontage, et annule les requêtes de disponibilité
zombies. `tsc` : **0 régression** (1198 = 1198). Tests : **3/3** nouveaux tests couvrant (a) annulation au
changement de valeur, (b) non-écrasement par réponse obsolète, (c) annulation au démontage — la suite
échouerait contre l'ancien code (vraie RED).
