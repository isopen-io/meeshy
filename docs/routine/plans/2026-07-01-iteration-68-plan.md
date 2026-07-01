# Iteration 68 — Plan d'implémentation (2026-07-01)

> **Note de consolidation (iter 69)** : document nettoyé — il avait été concaténé par un merge parallèle
> (deux agents, même lot F30-d, même numéro d'itération).

## Objectif
Sous-lot **F30-d** : converger les 2 sites de partage de conversation (quasi-doublons desktop/liste)
vers la source unique `copyToClipboard`, gagnant le fallback iOS/WebView non sécurisé sur le chemin
presse-papiers. `navigator.share` inchangé.

## Étapes (implémentation → vérification)

### Phase A — Conversion des 2 sites
- [x] `components/conversations/header/use-header-actions.ts` (`handleShareConversation`) : import
      `copyToClipboard` ; branche `else` (Web Share absent) → `const { success } = await copyToClipboard(fullMessage)`
      ; toast succès/erreur selon `success`. `try/catch` conservé (dédié à `navigator.share` / `AbortError`).
- [x] `components/conversations/conversation-item/ConversationItem.tsx` : idem (motif identique).

### Phase B — Vérification & livraison
- [x] `tsc --noEmit` : count identique à la baseline `main` (1198), 0 nouvelle catégorie d'erreur.
- [x] `jest` ParticipantPresenceIndicator (5/5 vert) ; aucun test ne couvre `handleShareConversation`.
- [x] Commit + push + PR (#1247) + CI verte + **merge**.

## Séquelle (traitée en iter 69)
Collision avec un agent parallèle ayant livré le **même** F30-d sur les **mêmes 2 fichiers** → **doublon
d'import `copyToClipboard`** (`TS2300` + ESLint `no-duplicate-imports`) cumulé par le merge Git, plus
marqueurs de conflit laissés dans le doc `iteration-68-analyse.md`. Régression build sur `main`.

## Continuité
Iter 69 : **corriger la régression** (doublon d'import + marqueurs de conflit) en priorité, consolider
les docs iter-68, puis poursuivre F30 (reste ~8 sites) : « copie message » (`use-message-interactions.ts`)
ou « Header partage » (5 sites `Header.tsx`). Ou F31 (dédup `truncateText`).

## Statut
- [x] Phase A — 2 sites convertis (mergés).
- [x] Phase B — livré, PR #1247 mergée.
- [x] Séquelle régression → corrigée en iter 69.
