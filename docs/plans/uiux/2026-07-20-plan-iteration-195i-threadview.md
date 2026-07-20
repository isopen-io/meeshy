# Plan Iteration-195i — ThreadView : structure VoiceOver

**Branche de travail** : `claude/laughing-thompson-d8mogw`
**Base** : `main` HEAD `98ecd36` (194i `LinksHubView` #2174 mergé)
**Piste** : iOS (`i`)

## Objectif

Doter `ThreadView` (écran discussion/thread, 3 modificateurs a11y) d'une structure
VoiceOver correcte — priorité au **bouton d'envoi non labellisé** (action primaire
inutilisable en VoiceOver).

## Étapes

1. [x] Resync branche depuis `origin/main` (inclut 194i #2174).
2. [x] Vérifier contention : `search_pull_requests ThreadView` / `EditPostSheet` → 0 PR.
   Numéro **195i** > plus haut mergé (194i).
3. [x] Bouton envoi → `.accessibilityLabel` (`composer.send.label` / `bubble.delivery.sending`
   selon `isSending`) + `.accessibilityHint` (`composer.send.hint`). 0 clé neuve.
4. [x] Titre « Discussion » → `.accessibilityAddTraits(.isHeader)`.
5. [x] Divider « N réponses » → `.combine` + `.isHeader` (règles décoratives absorbées).
6. [x] Message parent (VStack nom+heure) + rangée réponse (VStack nom+heure+contenu) →
   `.accessibilityElement(children: .combine)`. Avatars (mood tap) laissés séparés.
7. [x] Analyse + plan + tracking.
8. [ ] Commit + push + PR ; gate CI `iOS Tests`.

## Contraintes

- 0 changement visuel, 0 logique, 0 clé i18n neuve, 0 SDK, 0 test neuf, 1 fichier.
- APIs iOS 14/16 sous plancher app → pas de garde de disponibilité.
- Auteur en conteneur Linux → build/VoiceOver validés en CI.
