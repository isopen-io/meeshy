# Iteration 70 — Analyse d'optimisation (2026-07-01)

## Protocole renforcé v2 (démarrage) — RÉGRESSION BUILD détectée & corrigée
Au démarrage, la vérification élargie a révélé une **régression build sur `main`** consécutive à une
collision inter-agents sur le lot iter 68 (F30-d). (Iter 69 est occupé par un agent parallèle — lot
ObjectId MongoDB, disjoint ; ce lot est donc numéroté **70**.)

### Diagnostic
Deux agents parallèles (`claude/sharp-wozniak-0fc6ol` = nous, `claude/sharp-wozniak-40x133`) ont livré le
**même** F30-d sur les **mêmes 2 fichiers**, chacun ajoutant `import { copyToClipboard } from '@/lib/clipboard'`
sur une **ligne différente**. Le merge Git, ne voyant **aucun conflit textuel** (ajouts sur lignes
distinctes), a **cumulé les deux imports** → doublon :

- `components/conversations/header/use-header-actions.ts` : import en L3 **et** L6.
- `components/conversations/conversation-item/ConversationItem.tsx` : import en L8 **et** L13.

`tsc` : **4× `TS2300 Duplicate identifier 'copyToClipboard'`** (2 par fichier). **Build cassé sur `main`.**
Chaque PR passait le CI **isolément** (l'import n'était présent qu'une fois dans chaque branche) ; le
doublon n'apparaît qu'**après le merge des deux** — angle mort classique du CI par-PR.

### Correction (iter 70)
1. Suppression du **second** `import { copyToClipboard }` dans chacun des 2 fichiers (garde la 1re occurrence).
2. Consolidation des docs `iteration-68` (analyse + plan), eux aussi **concaténés** par le même merge parallèle.

### Garanties
- `tsc` (apps/web) : **909 → 905** erreurs, diff = **exactement les 4 `TS2300` retirées, 0 ajoutée** →
  retour à la baseline propre `main` (905 erreurs pré-existantes hors périmètre).
- `jest` header + conversation-item : **27/27** verts.
- Recensement : **aucun autre doublon** `copyToClipboard` sur l'app. F30-a/b/c/d bien convergés sur `main`.

## Leçon PROC renforcée (protocole v3)
Sur un domaine à **fort parallélisme** (F30 : ~40 PR concurrentes), le merge Git peut **cumuler deux
ajouts identiques** (même import, lignes différentes) **sans conflit** → régression invisible au CI par-PR.
**Ajout au protocole de démarrage** : après `git checkout origin/main`, exécuter `tsc --noEmit` (ou au
minimum `grep -c` des imports des sources uniques récemment adoptées) pour détecter les **doublons
d'import** avant de choisir un nouveau lot. Un lot « propre » commence par un `main` qui compile.
## Protocole renforcé v2 (démarrage) — OK
`main` réaligné sur `origin/main` (`2e2796b1`, force-update détecté vs branche de travail →
`git checkout -B claude/sharp-wozniak-59kjx0 origin/main`). Environnement reconstruit :
- `bun install --ignore-scripts` (le postinstall `@prisma/engines` échoue en `ECONNRESET` — CDN des
  binaires Prisma hors allowlist proxy ; contrainte connue et stable depuis iter 63).
- `packages/shared` : `bun run build` → **exit 0** (compile sans Prisma, `dist/` regénéré → débloque les
  suites web qui mockent `@meeshy/shared/*`).
- Baseline `tsc --noEmit` (apps/web) : **1198 erreurs pré-existantes** (identique iter 68/69 → aucune dérive).
- **jest runnable localement** (contrairement à la crainte iter 69) : `lib/clipboard.test.ts` 18/18 vert.

**Conséquence** : cette itération est **entièrement vérifiable en local** (tsc baseline + jest sur toutes les
suites impactées, y compris celles couplées au presse-papiers). On peut donc **clôturer F30 en un trait**
plutôt qu'en énième sous-lot.

## Cible iter 70 — Clôture complète de l'unification presse-papiers (F30)

### Contexte du backlog F30
La source unique `copyToClipboard` (`apps/web/lib/clipboard.ts`) existe et gère les fallbacks
**iOS / WebView / contexte non sécurisé** (API Clipboard → `execCommand` → sélection manuelle). Les
sous-lots précédents ont convergé :
- **F30-a** (iter 65) : TextViewer, AttachmentContextMenu, AgentConfigDialog
- **F30-b** (iter 66) : feeds/reels (PostsFeed, ReelsFeed, reel/page, feeds/post/page)
- **F30-c** (iter 67) : groups-layout / groups-layout-responsive
- **F30-d** (iter 68) : use-header-actions, ConversationItem (partage conversation)

### Constat — 13 sites `navigator.clipboard.writeText` bruts restants
Ces sites appellent l'API brute, qui **jette silencieusement** hors contexte sécurisé (WebView, http)
ou sur iOS Safari en mode non-secure → **échec de copie sans feedback** (voire toast succès mensonger).

| Fichier | Sites | Particularité |
|---------|-------|---------------|
| `components/layout/Header.tsx` | 5 (l.100, 253, 300, 510, 579) | branches `else` de `navigator.share`, handlers inline synchrones ; **test couplé** (Header.test) |
| `hooks/use-message-interactions.ts` | 2 (l.129, 155) | copie contenu + lien message ; **test couplé** (BubbleMessageNormalView.test) |
| `components/settings/TwoFactorSettings.tsx` | 1 (l.130) | `copyToClipboard` **local** (collision de nom), `.then()` sans catch |
| `components/affiliate/share-affiliate-modal.tsx` | 1 (l.152) | `copyToClipboard` **local** (collision de nom), try/catch complet |
| `app/admin/tracking-links/page.tsx` | 1 (l.248) | `copyToClipboard` **local** (collision de nom), toast succès inconditionnel |
| `app/admin/share-links/page.tsx` | 1 (l.148) | `copyToClipboard` **local** (collision de nom), toast succès inconditionnel |
| `services/tracking-links.ts` | 1 (l.230) | `copyTrackingLinkToClipboard` → `Promise<boolean>` |
| `lib/share-utils.ts` | 1 (l.110) | fallback de `shareLink` ; **test couplé** (share-utils.test) |

**4 sites portent une fonction locale `copyToClipboard`** → import aliasé
`copyToClipboard as copyTextToClipboard` pour éviter la collision, corps délégué à la source unique.

### Couplage tests — 3 suites à mettre à jour
`copyToClipboard` sous jsdom : `window.isSecureContext` est **falsy par défaut** → la source unique prend
la branche `execCommand` et **n'appelle PAS** `navigator.clipboard.writeText`. Les suites qui assertent
`writeText` doivent donc **mocker `@/lib/clipboard`** (motif déjà établi par F30-a/b : `TextViewer.test`,
`links/tracked/token/page.test`) :
- `Header.test.tsx` (assertions `mockClipboardWriteText`)
- `BubbleMessageNormalView.test.tsx` (2 assertions `navigator.clipboard.writeText`)
- `share-utils.test.ts` (fallback `mockWriteText` de `shareLink`)

### Préservation de comportement
- Toast succès conservé sur succès ; ajout d'un toast/erreur gracieux uniquement là où un chemin
  d'erreur existait déjà (affiliate). Les sites « toast succès inconditionnel » ne toastent plus sur échec
  silencieux (amélioration, pas régression — l'ancien code ne gérait pas l'échec du tout).
- `navigator.share` inchangé partout ; seules les branches fallback presse-papier convergent.
- Signatures publiques inchangées (`copyTrackingLinkToClipboard: Promise<boolean>`, fonctions locales
  `copyToClipboard` conservées comme wrappers).

## Baselines vérifiées (avant modification)
- `lib/clipboard.test.ts` : 18/18 ✅
- `Header.test.tsx` + `share-utils.test.ts` + `TwoFactorSettings.test.tsx` : 67/67 ✅
- `BubbleMessageNormalView.test.tsx` : 53 pass / 1 skip ✅
- `tsc --noEmit` apps/web : 1198 (baseline) ✅
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
| F30 (reste) | ~8 sites : Header ×4 (landing, fire-and-forget), TwoFactorSettings, use-message-interactions, share-affiliate-modal, admin/{share,tracking}-links, tracking-links.ts, share-utils.ts | MOYEN |
| F31 | `truncateText` dupliqué (`truncate.ts` vs `xss-protection.ts`) | FAIBLE-MOYEN |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut — flip = validation staging requise (non autonome) | HAUT (~75 % BP) |
| PROC | Collisions inter-agents fréquentes sur F30 — préférer les clusters « exotiques » peu ciblés + détecter les doublons d'import post-merge | PROCESS |

## Gain
Build `main` **restauré** (0 `TS2300`). Docs iter-68 consolidés. Protocole de démarrage renforcé v3
(détection des doublons d'import post-merge). Aucune perte de la convergence F30 déjà acquise.
| **F32** | Regex ObjectId dupliquée **gateway** (~25 sites) — non vérifiable local (Prisma). Lot dédié. | MOYEN-HAUT |
| **N1** | `formatDate` (Intl.DateTimeFormat) dupliqué dans les 3 ranking cards admin (ConversationRankCard, UserRankCard, MessageRankCard) — dédup pure, zéro risque. | FAIBLE-MOYEN |
| **N2** | Type `AdminApiResponse<T>` redéfini dans 4 fichiers user-detail admin → `types/` partagé. | FAIBLE |
| **N3** | `formatTimeAgo` réimplémenté dans 4 composants admin/agent → helper unique. | FAIBLE-MOYEN |
| F31 | `truncateText` : collision de noms **à sémantiques différentes** — NE PAS fusionner. | À NE PAS FUSIONNER |
| F25b | Deux validateurs téléphone à APIs divergentes — refactor comportemental. | MOYEN |

## Gain
Clôture **complète** de F30 : littéral `navigator.clipboard.writeText` nu applicatif passe de **13 → 0**
(seule la source unique `lib/clipboard.ts` le porte). Comportement presse-papier **unifié** sur tout
`apps/web` — robustesse iOS/WebView/contexte non sécurisé garantie partout. Cible directement alignée sur
« unification des comportements par rapport au système sur lequel on tourne ». CI vérifiée verte en local.
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
