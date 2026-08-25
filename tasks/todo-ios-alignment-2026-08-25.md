# Alignement iOS — 8 directives — 2026-08-25

Plan : `docs/superpowers/plans/2026-08-25-ios-alignment-audit.md`. Worktree `../v2_meeshy-ios-align`.

## Directives (verbatim, résumé)
1. Fil de messages fluide SANS EFFET au défilement — tolérés : composer→bulle, entrée d'un message, effets sur messages.
2. Sockets social + messagerie parfaits : alignement frontend/backend, features couvertes en Focal/Script/Rivière.
3. Modifications effectives (profil, conversation, message, communauté, lien, contact) : bons endpoints, bonnes interfaces, données cohérentes.
4. Synchroniser TOUS ses contacts (pas 200).
5. Tous les signaux d'appel reçus ; rejoindre un appel en cours même après redémarrage — agents spécialisés par situation.
6. Appels stables sous mauvais réseau : geler une trame / rester sur la dernière image plutôt que couper le flux.
7. Réduire drastiquement la consommation de données.
8. UX : réduire les interactions, remonter les features enfouies — PROPOSER.

Contraintes : aucune régression, aucun sous-entendu implémenté, modèles étagés par complexité, auto-revue de chaque agent.

## Vague A — audit
- [ ] Workflow lancé, premier prompt vérifié
- [ ] Résultats revus intégralement (porte avant vague B)
- [ ] Confirmés / réfutés consignés dans `docs/audits/2026-08-25-ios-alignment-audit.md`

## Vague B — correctifs (à détailler après A)
- [ ] Contacts complets (L4)
- [ ] Geler ≠ couper (L6)
- [ ] Autres défauts confirmés (L1, L2, L3, L5, L7 safe_now)
- [ ] Gate iOS (DerivedData privé) + SDK + gateway
- [ ] Revue opus finale, commit, PR

## Revue
Voir `docs/audits/2026-08-25-ios-alignment-audit.md` § Méthode et § Gates ; propositions dans `…-proposals.md`.

## Vague A — FAIT (2026-08-25)
- [x] Workflow `wf_edbd95a6-65c` : 22 agents, 35 confirmés / 5 réfutés
- [x] Revue orchestrateur : sondages code concordants ; briefs par lentille
- [x] Digest copié dans `docs/audits/2026-08-25-ios-alignment-audit-digest.md`

## Vague B — grappes A…K2 (voir plan) 
- [x] Workflow B (12 grappes) : 11 rendues, A morte sur erreur d'API puis reprise (A5 corrigé, A6 testé, C3 livré)
- [x] Revue adversariale opus : 10 grappes (4 blockers, 12 majors) → vague de correctifs post-revue lancée ; A+C en cours de revue
- [x] Correctifs post-revue appliqués (33 appliqués / 2 refus motivés)
- [x] Gate iOS app : build vert (1 correctif d'isolation), 3 509 + 4 905 + 1 tests, 1 rouge (commentaire) corrigé
- [x] Revue A+C appliquée (F1 blocker : drains non gardés)
- [x] Phase 0 SDK passage 4 (1 flake outbox prouvé) + relance ciblée app 227/227
- [x] 7 commits par grappe (contacts, profil, sdk sockets, conversation, feed, appels, ux)
- [x] Commits A+C, fix test AuthManager, livrables + pbxproj ; PR ouverte
- [ ] Doc propositions `docs/audits/2026-08-25-ios-ux-and-bandwidth-proposals.md`

## Gates déjà rendus
- gateway : tsc 0 erreur ; 876/876 suites (4 rouges sous charge, 95/95 à la relance)
- web : 793/793 suites (5 rouges sous charge, 100/100 à la relance) ; tsc = 15 erreurs PRÉEXISTANTES dans des fichiers non touchés
- iOS phase 0 SDK : 3 975 + 3 557 tests, 0 échec (avant les correctifs post-revue — à relancer)
