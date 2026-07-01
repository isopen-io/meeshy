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
## Protocole renforcé v2 (démarrage) — OK
`main` réaligné (`026b2bb0`, force-update détecté vs branche de travail — branche de travail remise à zéro sur
`origin/main`). Environnement re-provisionné (clone frais, `node_modules` absent) :
- `bun install` : les scripts `postinstall` de `@prisma/engines` échouent (`ECONNRESET`, CDN
  `binaries.prisma.sh` bloqué par le proxy — **identique iter 68/69**). Installé avec `--ignore-scripts`
  (2081 paquets) → **web + shared vérifiables**, **gateway non vérifiable** (client Prisma non générable).
- Baseline `tsc --noEmit` (apps/web) : **1198 erreurs pré-existantes** (identique iter 69 → aucune dérive).
- `packages/shared` : `bun run build` (dist) exit 0 ; vitest exit 0.

**Contrainte environnement (rappel)** : le type-check/tests **gateway** ne sont **pas vérifiables** en local
(Prisma). On cible donc à nouveau un cluster **web/shared** à CI garantie verte. **F32 (SSOT ObjectId gateway)**
reste en backlog tant que le proxy bloque le CDN Prisma.

## Choix de cible — anti-collision + vérifiabilité + impact SSOT
Fan-out d'exploration (agent Explore) → 5 candidats web mécaniques. Analyse de sémantique :

| Candidat | Sites | Verdict |
|----------|-------|---------|
| `capitalize` (`x.charAt(0).toUpperCase()+slice(1)`) | ~4 réels | **Conflaté** par l'agent avec l'initiale d'avatar (`(x\|\|'U').charAt(0).toUpperCase()`, ~20 sites, **sémantique différente** : 1 seul caractère, pas de `+slice(1)`, char de fallback variable). Fusion **non mécanique** → backlog F33. |
| initiale d'avatar | ~20 | Fallback char divergent (`'U'`/`'C'`/`'#'`) + chaînes de fallback multiples → **non mécanique**. Backlog F33. |
| `msToSeconds` (`Math.floor(ms/1000)`) | 8 | Arithmétique triviale — wrapper = sur-abstraction (CLAUDE.md « ne pas sur-ingénier »). **Écarté.** |
| `isValidUrl` (`try{new URL()}catch`) | 3 | Bon, mais 3 sites et `xss-protection.ts` à étendre — backlog F34. |
| localStorage JSON | 13 | Gestion d'erreur/fallback **divergente par site** → risque comportemental. Backlog F35. |

### Constat retenu — `formatFileSize` réimplémenté hors de la source unique
Une **source unique de vérité existe déjà** : `formatFileSize()` dans `@meeshy/shared/types/attachment`
(B/KB/MB/GB/TB, clamp au dernier palier, `parseFloat(.toFixed(2))`), consommée par **~15 sites**
(MessageComposer, FilePreviewCard, Image/File/Video/PDF lightboxes, `attachmentService`, `tusUploadService`…).
**Trois** modules la **réimplémentent en ligne**, violant le principe *Single Source of Truth* :

| Fichier | Forme locale | Rapport à la SSOT |
|---------|--------------|-------------------|
| `components/attachments/AttachmentDetails.tsx:60` | `const formatFileSize` (B/KB/MB/GB, `toFixed(2)`) | **byte-identique** pour tailles réalistes (< 1 TB) |
| `utils/media-compression.ts:319` | `function formatFileSize` (idem) | **byte-identique** |
| `app/admin/monitoring/page.tsx:272` | `const formatBytes` (`toFixed(1)`) | diffère **uniquement** par la précision (1 vs 2 décimales) |

Un 4e module — `components/admin/user-detail/UserMediaSection.tsx:41` `formatSize` — a une **sémantique
distincte** (`''` si falsy, `toFixed(0)` en KB, seuils manuels B/KB/MB). **Non fusionné** → backlog F36.

## Cible iter 70 — Convergence sur la source unique `formatFileSize`

### Conception (préservation de comportement)
1. **Extension rétro-compatible** de la SSOT : `formatFileSize(bytes, options?: { decimals?: number })`,
   `decimals` par défaut **2** → les **~15 appelants existants sont strictement inchangés**. `monitoring`
   passe `{ decimals: 1 }` pour **reproduire exactement** son ancien affichage.
2. `AttachmentDetails.tsx` + `media-compression.ts` : suppression de la copie locale → import de la SSOT
   (byte-identique).
3. `monitoring/page.tsx` : `formatBytes` devient un alias `formatFileSize(bytes, { decimals: 1 })` — **les
   sites d'appel restent inchangés** (impact minimal).

### Pourquoi ce choix
- **Purement mécanique + vérifiable** (web tsc baseline + jest ciblé + vitest shared), CI garantie verte.
- Renforce un **SSOT existant** plutôt que d'en créer un nouveau → cœur du principe *Single Source of Truth*.
- Les candidats plus volumineux (avatar-initial, localStorage) portent une **variance sémantique** qui les
  rend non-mécaniques → différés proprement au backlog.
## Protocole renforcé v2 (démarrage)
- `main` réaligné sur `df4e2e57` (HEAD : *fix ios/calls thread-safe audio counters*). Branche de travail
  `claude/sharp-wozniak-omcla9` reset dur sur `origin/main` avant toute analyse (anti-répétition / anti-collision).
- **Contrainte environnement (durcie cette itération)** : aucun `node_modules` installé (racine, `apps/web`,
  `packages/shared` tous vides) ; client Prisma **non générable** (binaires `@prisma/engines` bloqués par le proxy,
  RC 1 silencieux) ; `packages/shared/dist` absent (`bun run build` échoue : `@types/node` manquant).
  → `tsc` global du web remonte **71 964 erreurs de bruit** (résolution de modules), inexploitable tel quel.
  → **Vérification locale** : baseline **par fichier** ciblée (bruit constant TS2307/TS7026/TS7006 filtré),
  la CI reste le **gate réel** (comme itérations 68-69).

## Choix de cible — anti-collision + vérifiabilité + valeur UX réelle
Backlog récent (iter 69) : **F32** (SSOT ObjectId gateway ~25 sites, **non vérifiable** local → écarté),
**F30 reste** (~8 sites `navigator.clipboard.writeText` bruts). Le cluster **admin links** (listé en continuité
iter 68) est choisi : disjoint des cibles récentes (iter 67 = copie identifiant groupe ; iter 68 = partage
conversation ; iter 69 = ObjectId), et porteur d'un **vrai gain UX**, pas seulement d'une dédup cosmétique.

### Constat — faux toast de succès + zéro fallback iOS
Les deux pages admin réimplémentent une fonction locale `copyToClipboard` **naïve** :

```ts
const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);        // fire-and-forget, promesse non attendue
  toast.success(t('...copiedToClipboard'));   // succès affiché INCONDITIONNELLEMENT
};
```

| Fichier | Bug |
|---------|-----|
| `app/admin/share-links/page.tsx:147` | `writeText` non `await` → si l'API échoue (WebView iOS, contexte non-sécurisé, permission refusée), le toast **« Copié »** s'affiche quand même. **Aucun** fallback textarea. |
| `app/admin/tracking-links/page.tsx:247` | idem (`trackingLinks.copySuccess`). |

La source unique `lib/clipboard.ts` → `copyToClipboard()` gère déjà : (1) `navigator.clipboard` + garde
`window.isSecureContext`, (2) **fallback textarea iOS/anciens navigateurs** (`setSelectionRange`, flash), et
renvoie `{ success, message }`. Les deux pages **contournaient** cette robustesse.

## Cible iter 70 — Convergence admin-links vers la source unique presse-papier
Changement **mécanique + correctif UX** :
1. Chaque page importe `copyToClipboard as copyTextToClipboard` depuis `@/lib/clipboard`.
2. Le wrapper local devient `async` : `const { success } = await copyTextToClipboard(text)` puis
   `toast.success(...)` **si** succès, sinon `toast.error(...)`.
3. Nouvelle clé i18n `copyError` ajoutée aux namespaces `shareLinks` **et** `trackingLinks`, sur les **4 langues**
   (fr/en/es/pt) — aucune clé orpheline.

Les call sites sont tous des `onClick={() => copyToClipboard(x)}` fire-and-forget → passage à `async` sans risque.

### Pourquoi ce choix (vs alternatives)
- **F32 gateway** : plus impactant mais **non vérifiable** (Prisma) → reste backlog.
- Sites `Header.tsx` (×5, landing) : motif `fire-and-forget` distinct, plus disputé inter-agents → écarté.
- `share-utils.ts` / `tracking-links.ts` (couche service) : candidats propres mais `shareLink` a un test
  (`__tests__/lib/share-utils.test.ts`) mockant `navigator.clipboard.writeText` → refactor comportemental à
  isoler dans un lot dédié (**F30-svc**, consigné). Les pages admin n'ont **aucun** test sur `copyToClipboard`.

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
| **F32** | Regex ObjectId dupliquée **gateway** (~25 sites) — non vérifiable local (Prisma). | MOYEN-HAUT |
| **F33** | Initiale d'avatar `(x\|\|'…').charAt(0).toUpperCase()` (~20 sites) + `capitalize` (~4) — fallback/chaînes divergents, **non mécanique**. Nécessite un helper `avatarInitial(name, opts)` + audit par site. | MOYEN |
| **F34** | `isValidUrl` (`try{new URL()}catch`) — 3 sites → exporter depuis `xss-protection.ts`. | FAIBLE-MOYEN |
| **F35** | localStorage JSON (13 sites) — gestion d'erreur/fallback divergente, refactor comportemental. | MOYEN |
| **F36** | `UserMediaSection.formatSize` — sémantique compacte distincte (`''`/`toFixed(0)`), ne pas fusionner tel quel. | FAIBLE |
| F25b | Deux validateurs téléphone (`phone-validator` simple vs `phone-validation-robust` libphonenumber) — APIs divergentes. | MOYEN |

## Gain
Réimplémentations locales de « octets → lisible » : **3 → 0**. `formatFileSize` : **1 seule** implémentation
(SSOT étendue, rétro-compatible). tsc : **0 régression** (1198 = 1198). vitest shared : **153/153** (dont
**+3** nouveaux tests `decimals`/clamp). jest web : **80/80** sur les 3 suites impactées. Lint exit 0.
| **F32** | Regex ObjectId dupliquée **gateway** (~25 sites) → SSOT partagé (shared). Non vérifiable local (Prisma). | MOYEN-HAUT |
| **F30-svc** | `lib/share-utils.ts` (`shareLink` fallback) + `services/tracking-links.ts` (`copyTrackingLinkToClipboard`) → converger vers `lib/clipboard`. `shareLink` a un test à adapter. | MOYEN |
| F30 reste | `Header.tsx` ×5, `TwoFactorSettings`, `use-message-interactions` ×2, `share-affiliate-modal` → source unique presse-papier. | MOYEN |
| F31 | `truncateText` collision de sémantiques — **NE PAS** fusionner. | — |
| F25b | Deux validateurs téléphone (APIs divergentes). | MOYEN |

## Incident CI — `main` était rouge (détecté en cours d'itération)
Le premier run CI (`Build (bun)`) a échoué **hors de mes fichiers** : `main` (avancé de `df4e2e57` à
`1df16a6d` pendant l'itération, via merges parallèles) portait un **`import { copyToClipboard }` dupliqué**
dans `components/conversations/conversation-item/ConversationItem.tsx` (lignes 8+13) et
`components/conversations/header/use-header-actions.ts` (lignes 3+6) → `next build` :
`Identifier 'copyToClipboard' has already been declared`. Cause : deux agents F30 parallèles ayant ajouté le
même import sur des lignes non-conflictuelles → git a conservé les deux copies au merge.

**Action** : rebase de la branche sur `1df16a6d` + suppression des imports dupliqués (2 lignes). Scan de tout
`apps/web` (script Python, comptage des lignes `import ... from` par fichier) → **0 autre import dupliqué**.
Leçon consignée : le merge parallèle de dédup d'imports peut produire des doublons silencieux non-conflictuels ;
vérifier `next build` (pas seulement tsc) sur la cible.

## Gain
- **Correctif build** : `main` repassé au vert (import dupliqué supprimé, cause d'un `next build` cassé pour
  toute l'équipe).
- **Correctif UX réel** : plus de faux « Copié » quand la copie échoue (toast d'erreur explicite).
- **Robustesse iOS/WebView** : les 2 pages admin héritent du fallback textarea de la source unique.
- **Dédup** : littéral `navigator.clipboard.writeText` nu applicatif : 2 sites admin → 0.
- **Vérif** : tsc par fichier — **0 erreur nouvelle** (les 5 erreurs `TS2339` pré-existantes se décalent
  seulement de +1 ligne = l'unique import ajouté ; aucun code d'erreur nouveau). i18n : 8 clés ajoutées,
  4 langues symétriques. CI = gate final.
