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

## Phase 4 — Vérification & livraison (EN COURS)
- [ ] Tests gateway verts (bun) — install dépendances en cours
- [ ] Revue statique iOS (pas de simulateur dans cet env linux)
- [x] Commits propres + push (3 commits poussés)

## Review
(à compléter en fin de tâche)
