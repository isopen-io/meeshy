# Iteration 66 — Analyse d'optimisation (2026-07-01)

## Protocole renforcé v2 (démarrage) — OK
Après merge d'iter 65 (`copyToClipboard` F30-a, PR #1216 → `main` `18fab5d5`), vérification élargie :
- `utils/time-remaining.ts` : `formatTimeRemaining` + `isExpired` présents.
- `utils/format-number.ts` : `formatCompactNumber` présent.
- `utils/truncate.ts` : `truncateFilename` + `truncateText` présents.
- Le lot iter 65 est bien sur `main` (4 composants convergés). Aucune régression de merge parallèle.

## Cible iter 66 — F30 (suite), sous-lot F30-b « partage post/reel »
Après F30-a, il restait **16 sites** appelant `navigator.clipboard.writeText` en direct. Le sous-lot le
plus cohérent : le **cluster de partage feed/reel**, 4 sites au motif rigoureusement identique
« copier le lien du post/reel → `shareMutation.mutate` → toast » :

| Site | Copie | Test couplé |
|------|-------|-------------|
| `components/feed/PostsFeedScreen.tsx` | lien post/reel (selon `type`) | aucun |
| `components/feed/ReelsFeedScreen.tsx` | lien reel courant | aucun |
| `app/reel/[postId]/page.tsx` | lien reel courant | aucun |
| `app/feeds/post/[postId]/page.tsx` | lien post (catch silencieux) | aucun |

Ces sites bruts perdaient le fallback iOS/WebView de la source unique. Un `navigator.clipboard.writeText`
**jette** en contexte non sécurisé → le partage échouait silencieusement (page post) ou affichait un toast
d'erreur (reels), alors que le fallback `execCommand` aurait réussi la copie.

### Conversion (préservation de comportement)
`copyToClipboard` **ne jette jamais** (try/catch interne → `{ success }`). Le try/catch autour du
`writeText` devient donc inutile : conversion en `if (success) { mutate + toast succès } else { toast erreur }`.
La mutation de partage ne se déclenche que sur copie réussie — comportement identique à l'original
(la mutation suivait le `writeText` dans le `try`).

Aucun de ces 4 fichiers n'a de test (0 couverture feed/reel) → conversion sans churn de test.

## Consignés pour itérations futures

| # | Constat | Impact |
|---|---------|--------|
| F30 (reste) | ~12 sites bruts : Header, use-header-actions, ConversationItem, groups ×2, TwoFactorSettings, use-message-interactions, share-affiliate-modal, admin/{share,tracking}-links, tracking-links.ts, share-utils.ts | MOYEN |
| F31 | `truncateText` dupliqué (`truncate.ts` vs `xss-protection.ts`) | FAIBLE-MOYEN |
| F25b | Validateurs téléphone | MOYEN |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) |

## Gain
4 sites de partage feed/reel convergent vers la source unique → robustesse iOS/WebView gagnée, partage
de post/reel enfin fiable en contexte non sécurisé. Surface `navigator.clipboard` brute : 16 → 12 sites.
0 régression tsc (multiset d'erreurs identique à la baseline, seuls décalages de ligne).
