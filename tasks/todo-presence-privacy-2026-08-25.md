# Confidentialité de la présence — 2026-08-25

Plan : `docs/superpowers/plans/2026-08-25-presence-privacy.md`. Worktree `../v2_meeshy-presence`, branche `feat/presence-privacy-2026-08-25`.

Directive : hors amitié, ni état en ligne ni dernière connexion ; seule l'activité dans une conversation (m'écrire / répondre) révèle que je suis en ligne ; ADMIN et au-dessus voient toujours.

- [x] Inventaire (gateway, iOS, web+Android) — 3 agents, aucune modification client requise
- [ ] W1 loi + service + `GET /users/presence` + décision
- [ ] W2a conversations · W2b messages/appels/liens · W2c communautés · W2d socket · W2e stories/admin
- [ ] W3 suppression `resolvePrefsOnly` + garde, CLAUDE.md, suites complètes, revue opus
- [ ] Commit, PR

## Suivis
- web `useUserStore` : `lastActiveAt: null` reçu ne purge pas l'ancien horodatage (comportement préexistant) — à durcir si le produit veut l'oubli immédiat
- Android : `typing:start` ne force pas la présence (parité web/iOS) — hors directive
