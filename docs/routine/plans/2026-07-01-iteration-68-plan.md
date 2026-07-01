# Iteration 68 — Plan d'implémentation (2026-07-01)

## Contexte
Iter 67 (F30-c, copie identifiant groupe) a été **livré par un agent parallèle** et mergé dans `main` avant
notre PR (collision `mergeable_state: dirty`). Pivot anti-répétition : reset sur `main`, cible = **F30-d**.

## Objectif
Sous-lot **F30-d** : converger les 2 sites de **partage de conversation** (fallback presse-papier) vers la
source unique `copyToClipboard` (`lib/clipboard.ts`), gagnant les fallbacks iOS/WebView sur le fallback,
sans changement de comportement nominal, `navigator.share` inchangé.

## Étapes (délégation → vérification)

### Phase A — Conversion des 2 sites
- [x] `components/conversations/header/use-header-actions.ts` (`handleShareConversation`) : branche `else`
      → `const { success } = await copyToClipboard(fullMessage)` ; toast succès/erreur selon `success`.
      `try/catch` conservé (couvre `navigator.share` AbortError). Import `copyToClipboard` ajouté.
- [x] `components/conversations/conversation-item/ConversationItem.tsx` (`handleShareConversation`) : idem.
      Import ajouté.

### Phase B — Vérification & livraison
- [x] `tsc --noEmit` : total **1198 = 1198** (0 régression) ; **8 = 8** erreurs pré-existantes `unknown` dans
      les 2 fichiers, codes identiques (TS18046/TS2571/TS2339), seuls décalages de ligne (import + `else`).
      Bruit constant = shared/dist + client Prisma non générés (hôte binaire Prisma hors allowlist proxy).
- [x] Aucune suite de test ne rend `handleShareConversation` (ParticipantPresenceIndicator.test ne cite
      ConversationItem qu'en commentaire) → pas de test à mettre à jour.
- [ ] Commit + push `claude/sharp-wozniak-40x133` ; PR vers `main` ; CI verte ; **merge**.

## Continuité
Iter 69 : protocole renforcé v2 (vérifier `main`/collisions AVANT tsc), puis F30 (reste ~8 sites) — cluster
candidat : « admin links » (`admin/share-links`, `admin/tracking-links`, `services/tracking-links.ts`,
`lib/share-utils.ts`) ou « settings/2FA » (`TwoFactorSettings`, `use-message-interactions`). Header ×4
(landing) = motif distinct fire-and-forget. Ou F31 (dédup `truncateText`).

## Statut (mis à jour en fin d'itération)
- [x] Phase A — 2 sites convertis + imports.
- [x] Phase B — tsc 0 régression (1198=1198, 8=8) ; reste : push + PR + CI + merge.
