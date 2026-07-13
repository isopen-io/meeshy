# Onboarding singulier + Contact info + Contact sync (branche claude/onboarding-contact-sync-xg9b70)

## Contexte
Loop autonome (directive user 2026-07-13). Objectif : refondre la première exécution de l'app
(inscription singulière/moderne), compléter le profil avec incitations qualitatives, collecter
email/numéro (unicité + récupération de compte), et synchroniser les contacts téléphone ↔
plateforme (iOS, permissions hors main thread).

## Phase 0 — Cartographie (FAIT)
- [x] Flow onboarding iOS actuel (welcome → signup → profil) — wizard 8 étapes, assets profil jetés (fixé)
- [x] Endpoints existants de vérification numéro/email — check-availability, phone-transfer/check réutilisés
- [x] Pattern permissions iOS hors main thread — helper nonisolated + closure @Sendable
- [x] Onboarding web + suggestions — wizard web 5 étapes existe, pas de contact sync backend (créé)

## Phase 1 — Onboarding première exécution (copy + UX) — FAIT (commit f5c9258fb)
- [x] Carrousel page 1 : 5 continents, pays cités (France, Sénégal, Brésil, Japon, Australie, Canada) × 5 langues
- [x] Wizard : funHeader/funSubtitle réécrits (plus beau jour / crème de la crème sur profil)
- [x] Étapes téléphone/email : incitation unicité + engagements + récupération
- [x] BONUS fix : photo/bannière/bio du wizard désormais réellement uploadées (ProfileCompletionUploader)

## Phase 2 — Vérification numéro / récupération de compte (gateway) — FAIT (commit b25745f63)
- [x] /auth/phone-transfer/check étendu (réutilisé, pas recréé) : dormant + nameSimilarity + recoverySuggested
- [x] Similarité nom/prénom : Sørensen-Dice, tolère accents/casse/ordre inversé/typos
- [x] Tests écrits (name-similarity, service, route) — EXÉCUTION EN ATTENTE (bun install en cours)

## Phase 3 — Synchronisation de contacts (iOS + gateway) — FAIT (commits b25745f63, b2a870d82)
- [x] POST /users/me/contacts/match (E.164, jamais persisté serveur, cap 2000)
- [x] iOS ContactSyncService : permission hors main actor (pattern MicrophonePermission), fetch sur queue utilitaire
- [x] SDK : ContactMatchModels + ContactMatchService
- [x] UI DiscoverTab : bouton câblé (ex-stub) + section « Déjà sur Meeshy »
- [x] NSContactsUsageDescription : déjà présent dans Info.plist
- [x] Tests : MockContactSyncService + 3 tests DiscoverViewModel

## Phase 4 — Vérification & livraison (FAIT)
- [x] Tests gateway verts : suites ciblées 133/133, répertoire routes/users 232/232
- [x] tsc --noEmit gateway : exit 0
- [x] Revue statique iOS (pas de simulateur sur cet env Linux) : signatures des
      composants réutilisés vérifiées, cast NSString corrigé, sérialisation
      date-time corrigée côté gateway
- [x] Commits propres + push (7 commits)

## Review

### Livré
1. **Onboarding singulier (iOS)** : carrousel + wizard réécrits — mise en relation
   mondiale, pays des 5 continents cités, incitation « plus beau jour / crème de
   la crème » sur le profil, incitation contact (unicité, engagements, récupération).
2. **Fix fonctionnel** : photo/bannière/bio du wizard étaient jetées à l'inscription
   → désormais uploadées après création via ProfileCompletionUploader (best-effort).
3. **Récupération de compte dormant (gateway, réutilise /auth/phone-transfer/check)** :
   accepte firstName/lastName, renvoie dormant/dormantSince/nameSimilarity/
   recoverySuggested. Similarité Sørensen-Dice (accents/casse/ordre/typos).
   iOS : indice de récupération sur numéro pris (SDK checkPhoneOwnership).
4. **Synchronisation de contacts** : POST /users/me/contacts/match (E.164, jamais
   persisté serveur, cap 2000) + iOS ContactSyncService (permission Contacts HORS
   main actor, pattern anti-EXC_BREAKPOINT identique à MicrophonePermission) +
   section « Déjà sur Meeshy » dans DiscoverTab (ex-stub « bientôt disponible »).

### Points d'attention / suites possibles
- iOS non compilé (pas de toolchain Swift sur cet env Linux) — revue statique
  rigoureuse effectuée ; un `./apps/ios/meeshy.sh build` reste recommandé avant merge.
- Nouvelles clés i18n iOS avec defaultValue français : les traductions
  de/en/es/pt-BR des nouvelles clés (`onboarding.step.phone.recovery.*`,
  `contacts.discover.matches.*`, etc.) restent à ajouter au catalogue.
- Le web pourrait aussi passer firstName/lastName à phone-transfer/check pour
  bénéficier du hint de récupération (capacité gateway déjà en place).
