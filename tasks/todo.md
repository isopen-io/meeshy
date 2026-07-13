# Onboarding singulier + Contact info + Contact sync (branche claude/onboarding-contact-sync-xg9b70)

## Contexte
Loop autonome (directive user 2026-07-13). Objectif : refondre la première exécution de l'app
(inscription singulière/moderne), compléter le profil avec incitations qualitatives, collecter
email/numéro (unicité + récupération de compte), et synchroniser les contacts téléphone ↔
plateforme (iOS, permissions hors main thread).

## Phase 0 — Cartographie (en cours)
- [ ] Flow onboarding iOS actuel (welcome → signup → profil)
- [ ] Endpoints existants de vérification numéro/email (à réutiliser, pas recréer)
- [ ] Pattern permissions iOS hors main thread
- [ ] Onboarding web + suggestions de personnes existantes

## Phase 1 — Onboarding première exécution (copy + UX)
- [ ] Écran d'accueil : positionnement singulier — mise en relation mondiale, 5 continents,
      pays cités (ex: France, Sénégal, Brésil, Japon, Australie, USA, Maroc…)
- [ ] Étape complétion profil : nom, prénom, photo de profil, bannière
      → copy incitant à « être sous son plus beau jour » pour rencontrer la crème de la crème
- [ ] Étape contact : email + numéro de téléphone
      → copy expliquant pourquoi (gestion des engagements, récupération de compte)

## Phase 2 — Vérification numéro / récupération de compte (gateway)
- [ ] Réutiliser les endpoints existants de check d'existence numéro/email
- [ ] Unicité du numéro : refus si numéro actif ailleurs
- [ ] Cas numéro identique sur compte inactif depuis longtemps :
      comparer nom/prénom (match ou similarité) → proposer récupération de compte
- [ ] Tests gateway (TDD, bun)

## Phase 3 — Synchronisation de contacts (iOS + gateway)
- [ ] Endpoint gateway de matching contacts (numéros normalisés → users existants)
- [ ] iOS : demande d'accès Contacts hors main thread (suivre le pattern des autres permissions)
- [ ] iOS : lecture CNContactStore, normalisation E.164, envoi au gateway
- [ ] UI suggestions « déjà sur Meeshy »
- [ ] NSContactsUsageDescription dans Info.plist
- [ ] Tests

## Phase 4 — Vérification & livraison
- [ ] Tests gateway verts (bun)
- [ ] Build iOS si possible dans cet environnement (sinon revue statique rigoureuse)
- [ ] Commits propres + push -u origin claude/onboarding-contact-sync-xg9b70

## Review
(à compléter en fin de tâche)
