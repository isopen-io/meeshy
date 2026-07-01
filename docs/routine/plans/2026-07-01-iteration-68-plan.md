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
