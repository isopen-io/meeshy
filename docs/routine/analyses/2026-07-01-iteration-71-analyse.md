# Iteration 71 — Analyse d'optimisation (2026-07-01)

## Protocole renforcé v3 (démarrage) — OK
`main` @ `bb1ca52e` (post-fix régression iter 70). Vérification élargie **incluant la détection de doublons
d'import post-merge** (nouveauté v3) :
- Sources uniques : `time-remaining` (2), `format-number` (1), `truncate` (2) — présentes.
- **Doublons d'import** : `import { copyToClipboard }` — **1 seule occurrence par fichier app-wide** (la
  régression iter 70 est bien résorbée sur `main`).
- Lots F30-a…d convergés. Aucune nouvelle collision.

## Cible iter 71 — F30 (suite), sous-lot F30-f « TwoFactorSettings » (cluster exotique)
Après les collisions répétées sur les fichiers « chauds » (conversation header, feed — fortement disputés),
choix d'un cluster **exotique et auto-contenu**, peu ciblé par les agents parallèles : le paramétrage 2FA.

`components/settings/TwoFactorSettings.tsx` définissait une fonction **locale** `copyToClipboard` (ligne 129)
qui :
1. **Masquait le nom** de la source unique (`lib/clipboard.ts`) — anti-pattern de shadowing.
2. Utilisait `navigator.clipboard.writeText(text).then(...)` **brut, sans `catch`** → rejet non géré
   (unhandled rejection) et **aucun fallback** iOS/WebView.

Deux points d'appel : copie du **secret TOTP** (setup) et copie des **codes de secours** (backup codes).

### Conversion (préservation de comportement + robustesse)
- Import de la source unique `copyToClipboard`.
- Renommage de l'helper local en `handleCopy` (async) déléguant à la source unique :
  `const { success } = await copyToClipboard(text); if (success) toast.success(...)`.
  **Renommage impératif** : conserver le nom `copyToClipboard` en local **aurait recréé** le `TS2300`
  Duplicate identifier corrigé en iter 70 (import + fonction homonymes). Leçon v3 appliquée en amont.
- Mise à jour des 2 `onClick` → `handleCopy(...)`.

Gain : plus de shadowing, fallback `execCommand` gagné, rejet géré. Copie du secret TOTP / des backup codes
fiable même en contexte non sécurisé (WebView in-app, HTTP local).

`TwoFactorSettings.test.tsx` : **14/14** verts (aucune assertion clipboard — le renommage interne n'impacte pas).

## Consignés pour itérations futures

| # | Constat | Impact |
|---|---------|--------|
| F30 (reste) | ~7 sites : Header ×4 (landing), use-message-interactions, share-affiliate-modal, admin/{share,tracking}-links, tracking-links.ts, share-utils.ts | MOYEN |
| F31 | `truncateText` dupliqué (`truncate.ts` vs `xss-protection.ts`) | FAIBLE-MOYEN |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut — flip = validation staging (non autonome) | HAUT (~75 % BP) |
| PROC v3 | Détecter doublons d'import post-merge au démarrage ; préférer clusters exotiques peu disputés | PROCESS |

## Gain
Source unique clipboard adoptée dans le paramétrage 2FA (secret TOTP + backup codes), shadowing éliminé,
robustesse iOS/WebView gagnée. Surface `navigator.clipboard` brute : 8 → 7 sites. 0 régression tsc, 14/14 verts.
