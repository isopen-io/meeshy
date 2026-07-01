# Iteration 70 — Analyse d'optimisation (2026-07-01)

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

## Consignés pour itérations futures

| # | Constat | Impact |
|---|---------|--------|
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
