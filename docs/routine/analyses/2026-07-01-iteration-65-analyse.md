# Iteration 65 — Analyse d'optimisation (2026-07-01)

## Protocole renforcé v2 (démarrage) — OK
Vérification élargie des sources uniques récentes **et** de leurs exports/consommateurs :
- `utils/time-remaining.ts` : `formatTimeRemaining` **+** `isExpired` présents (restauration iter 64 intacte).
- `utils/format-number.ts` : `formatCompactNumber` présent (iter 63 intacte).
- `utils/truncate.ts` : `truncateFilename` + `truncateText` présents (iter 62 intacte).
- Aucune nouvelle régression de merge parallèle détectée sur `origin/main` (`7b486857`).

Constat annexe : `truncateText` est dupliqué (`utils/truncate.ts` **et** `utils/xss-protection.ts`) →
consigné backlog (F31) pour une itération future, hors périmètre iter 65.

## Cible iter 65 — F30 (unification `copyToClipboard`), sous-lot F30-a
Backlog historique F30 : **~22 sites** appellent encore `navigator.clipboard.writeText` en direct au
lieu de la source unique `copyToClipboard` (`lib/clipboard.ts`). La source unique existe et est déjà
adoptée par ~10 sites (modales de liens, `app/links`). Les sites bruts **perdent** les fallbacks
essentiels de la source unique :

1. **API Clipboard moderne** (contexte sécurisé) — chemin nominal.
2. **Fallback `textarea` + `execCommand('copy')`** — indispensable iOS Safari < 13.4 / WebView / contextes
   non sécurisés où `navigator.clipboard` est absent.
3. **Sélection manuelle guidée** (`inputSelector`) + flash visuel optionnel.

Un `navigator.clipboard.writeText` brut **jette** en contexte non sécurisé (WebView, http) → toast
d'erreur au lieu d'une copie réussie. C'est une régression UX/fluidité réelle sur mobile, pas cosmétique.

### Sous-lot F30-a — cluster « copie de contenu / lien »
Quatre composants dont la copie suit exactement le motif `try { await writeText } catch { toast.error }` :

| Composant | Copie | Test couplé |
|-----------|-------|-------------|
| `components/text/TextViewer.tsx` | contenu texte/code | `TextViewer.test.tsx` (assert `writeText`) |
| `components/text/TextLightbox.tsx` | contenu texte/code (plein écran) | `TextLightbox.test.tsx` (assert `writeText`) |
| `components/attachments/AttachmentContextMenu.tsx` | URL d'attachement | aucun couplage clipboard |
| `components/admin/agent/AgentConfigDialog.tsx` | ID conversation | `AgentConfigDialog.test.tsx` (assert `writeText`) |

`TextViewer`/`TextLightbox` sont des jumeaux quasi-identiques → cible d'unification idéale.

### Contrainte de test (jsdom)
`window.isSecureContext` est **falsy par défaut** en jsdom (les tests de `lib/clipboard.ts` le
positionnent explicitement via `defineProperty`). Après conversion, la source unique emprunte le
fallback `execCommand` et **n'appelle plus** `navigator.clipboard.writeText` → les 3 tests couplés
doivent mocker `@/lib/clipboard` (motif déjà utilisé par `conversation-links-section.test.tsx`).

## Consignés pour itérations futures

| # | Constat | Impact |
|---|---------|--------|
| F30 (reste) | ~18 sites `navigator.clipboard.writeText` restants (Header, feeds, groups, etc.) | MOYEN-HAUT |
| F31 | `truncateText` dupliqué (`truncate.ts` vs `xss-protection.ts`) | FAIBLE-MOYEN |
| F25b | Validateurs téléphone | MOYEN |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN |

## Gain attendu
4 sites de copie convergent vers la source unique → robustesse iOS/WebView (fallback `execCommand`)
gagnée gratuitement, comportement clipboard unifié, surface `navigator.clipboard` brute réduite de
22 → 18. Aucune régression de langage/UX ; pure convergence.
