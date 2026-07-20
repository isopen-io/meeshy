# Remédiation complète iOS — suivi (2026-07-20)

Spec : `docs/superpowers/specs/2026-07-20-ios-full-remediation-design.md`
Plan détaillé : `docs/superpowers/plans/2026-07-20-ios-full-remediation.md`

## Vague 1 — lanes parallèles (fichiers disjoints, worktrees)

- [ ] **Lane GW** — gateway notifications : GW1 posts câblés (fix majeur) · GW2 friendContentEnabled · GW3 mute fan-out · GW4 threadId/category · GW5 payload enrichi (createdAt/messageType/traduction Prisme) · GW6 appels (callsEnabled, fallback no-voip, stale-foreground) · GW7 pushSent/showPreview/DND timezone
- [ ] **Lane P-X** — présence 1/3/5 hors iOS : PX1 shared TS (recent→idle, garde 5 min) · PX2 web (maps, gating, labels, dédup users.service) · PX3 Android miroir · PX4 heartbeat gateway lastActiveAt
- [ ] **Lane P-iOS** — présence iOS : PI1 PresenceModels/PresenceStyle · PI2 PresenceManager 30 s + flips · PI3 surfaces labellisées (badge story, identity bar, a11y)
- [ ] **Lane N-iOS** — notifications iOS : NI1 busy_timeout+protection fichier · NI2 clé E2EE NSE · NI3 prePersist typé média · NI4 handler fiable + reply durable outbox · NI5 commenter depuis notifs sociales (threading : réponse→commentId, nouveau post→racine) · NI6 actions ami réelles + split catégories CALL · NI7 retry VoIP token + retrait FirebaseMessaging

## Vague 2 (après merge P-iOS)

- [ ] **Lane AV** — avatars/bannières : AV1 showsRetryButton découplé · AV2 retry silencieux + cache négatif · AV3 câblage 12 sites

## Intégration

- [ ] Reviews adversariales par lane AVANT merge ; findings confirmés corrigés en lane
- [ ] Merges ordonnés GW → P-X → P-iOS → AV → N-iOS
- [ ] Vérifs intégration : prisma generate + shared build ; gateway bun test:coverage ; meeshy.sh test ciblé + build ; xcodegen (build number préservé)
- [ ] Doc/mémoire présence (CLAUDE.md, mémoire) APRÈS CI verte
- [ ] Push main au jalon, surveiller CI (pas de push docs par-dessus)

## Annexe B — audit transverse (workflow ios-full-audit)

- [ ] Synthèse reçue → lanes B-* planifiées ici (fichiers disjoints, mêmes règles)

## Review (à compléter en fin de chantier)
