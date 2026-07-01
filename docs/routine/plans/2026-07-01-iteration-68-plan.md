# Iteration 68 — Plan d'implémentation (2026-07-01)

## Objectif
Sous-lot **F30-d** : converger les 2 sites de partage de conversation (quasi-doublons desktop/liste)
vers la source unique `copyToClipboard`, gagnant le fallback iOS/WebView non sécurisé sur le chemin
presse-papiers du partage.

## Étapes (implémentation → vérification)

### Phase A — Conversion des 2 sites
- [x] `components/conversations/header/use-header-actions.ts` : import `copyToClipboard` ;
      dans `handleShareConversation`, `else` branché sur
      `const { success } = await copyToClipboard(fullMessage); success ? toast.success(linkCopied) : toast.error(linkCopyError)`.
      `try/catch` conservé (dédié à `navigator.share` / `AbortError`).
- [x] `components/conversations/conversation-item/ConversationItem.tsx` : idem (motif identique).

### Phase B — Vérification & livraison
- [x] `tsc --noEmit` : count identique (1198) ; seuls décalages de numéros de ligne sur les erreurs
      `unknown` pré-existantes des 2 fichiers (lignes ajoutées) → 0 nouvelle catégorie d'erreur.
- [x] `jest` ParticipantPresenceIndicator (5/5 vert) ; aucun test ne couvre `handleShareConversation`.
- [ ] Commit + push `claude/sharp-wozniak-vz661u` ; PR vers `main` ; CI verte ; **merge**.

## Continuité
Iter 69 : F30 (reste ~8 sites) — cluster suivant candidat : « copie message »
(`use-message-interactions.ts` 2 sites : contenu + lien) ou « Header partage » (5 sites `Header.tsx`,
plus gros lot mais très homogène). Ou F31 (dédup `truncateText`).

## Statut (mis à jour en fin d'itération)
- [ ] Phase A — 2 sites convertis.
- [ ] Phase B — tsc 0 régression + jest vert ; push + PR + CI + merge.
> Note de consolidation (iter 69) : document nettoyé — il avait été concaténé par un merge parallèle
> (deux agents, même lot F30-d, même numéro d'itération).

## Objectif
Sous-lot **F30-d** : converger les 2 jumeaux de **partage de conversation** (fallback presse-papier) vers
la source unique `copyToClipboard`, `navigator.share` inchangé.

## Étapes
### Phase A — Conversion des 2 sites
- [x] `components/conversations/header/use-header-actions.ts` (`handleShareConversation`) : branche `else`
      → `copyToClipboard(fullMessage)` ; toast succès/erreur. `try/catch` conservé (AbortError). Import ajouté.
- [x] `components/conversations/conversation-item/ConversationItem.tsx` : idem.

### Phase B — Vérification & livraison
- [x] `tsc --noEmit` : 0 régression au moment de la livraison.
- [x] Aucune suite de test ne rend `handleShareConversation`.
- [x] Commit + push + PR + CI verte + **merge**.

## Séquelle (traitée en iter 69)
Collision avec un agent parallèle ayant livré le même F30-d → **doublon d'import `copyToClipboard`**
(`TS2300`) cumulé par le merge Git dans les 2 fichiers. Régression build sur `main`, corrigée en iter 69.

## Continuité
Iter 69 : **corriger la régression de doublon d'import** (priorité), consolider les docs iter-68, puis
poursuivre F30 (reste ~8 sites).
