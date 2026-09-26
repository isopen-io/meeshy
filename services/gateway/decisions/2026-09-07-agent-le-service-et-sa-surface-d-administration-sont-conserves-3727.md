## 2026-09-07 : Agent ✦ — le service et sa surface d'administration sont conservés (#3727)

**Statut** : Accepté

**Contexte** : #3727 posait la question fermée « garder ou retirer l'agent ✦ ? »
sur `services/agent/` (agents Impersonator/Animator/Support/FAQ, ~16 k lignes) et
sa surface d'administration gateway, alors 1977 lignes en un seul fichier
(`routes/admin/agent.ts`). #4284 a d'abord levé le blocage OPÉRATOIRE — le
fichier était trop gros pour qu'on y ajoute quoi que ce soit sans dépasser le
budget de taille — en le scindant en 8 modules (`agent-shared.ts`,
`agent-configs.ts`, `agent-observability.ts`, `agent-reset.ts`, `agent-llm.ts`,
`agent-roles.ts`, `agent-delivery-queue.ts`, plus `agent.ts` réduit à 85 lignes
comme compositeur), sans déplacer une seule route (`route-manifest.json`
identique octet pour octet avant/après). Cela a donné à la décision produit sa
mesure : 2172 lignes réparties sur 8 fichiers et 29 routes, plus
`agent-topics.ts` (327 lignes, inchangé) — relisibles une par une plutôt qu'en
bloc. Le porteur a tranché le 2026-09-02 (commentaire de #3727) : **on garde**,
sans retrait ni dépréciation.

Recheck du contexte à la clôture (2026-09-07), la formule d'origine
(« désactivé en produit ») décrivant un CONTRÔLE D'ACCÈS, pas un interrupteur
global :
- Aucun kill-switch : `services/agent/src/env.ts` ne porte aucun
  `AGENT_ENABLED`/équivalent — seules des clés LLM, ports et réglages de
  fenêtre. `AgentConfig.enabled` (`packages/shared/prisma/schema.prisma:3781`)
  est un bouton PAR CONVERSATION, `@default(true)`.
- Le seul gate réel est un CONTRÔLE DE RÔLE : `requireAgentAdmin` =
  `requirePermission('canManageAgent')` (ADMIN), et deux routes destructrices
  (`PUT /llm`, `DELETE /reset`) exigent en plus `requireSovereign()` (BIGBOSS)
  — `routes/admin/agent-shared.ts:26-46`.
- Les 8+1 modules sont montés (`routes/index.ts`, préfixe
  `/api/v1/admin/agent`) et servis en production.
- Il existe une UI admin complète (`legacy-web-final:apps/web/app/admin/agent/page.tsx`, ~19
  composants sous `legacy-web-final:apps/web/components/admin/agent/` ; depuis le
  retrait du legacy le 2026-09-24 (#7668), `apps/web/src/routes/admin-agent.tsx`) — pas seulement une API
  interne sans consommateur.

**Décision** : Le service `services/agent/` et sa surface d'administration
restent en production, sans retrait ni dépréciation. Ce qui reste à en faire —
notamment les 55 findings de `docs/agent-bugs-consolidated.md` (dont 5
CRITIQUE : écrasement silencieux du profil observé par un tableau vide du LLM,
corruption du résumé sur un JSON invalide, verrou Redis plus court que la durée
de scan, conversations éligibles par défaut faute d'`AgentConfig`, l'agent qui
se compte lui-même et s'auto-supprime) — redevient du travail ORDINAIRE, à
tracer par ses propres issues (le porteur, #3727).

**Alternatives rejetées** : retirer service + routes + modèles (`AgentConfig`,
`AgentUserRole`, le rôle `AGENT`) — écarté par le porteur ; le gate ADMIN-only
n'est pas, mesuré, un signe d'abandon technique, seulement un contrôle d'accès
attendu pour une surface d'administration.

**Preuve** : `routes/admin/agent.ts` (85 lignes, compositeur) + les 7 modules
qu'il assemble ; `route-manifest.json` (routes `/api/v1/admin/agent/*`
inchangées avant/après #4284) ; `packages/shared/prisma/schema.prisma:3777-3886`
(`AgentConfig`), `:3888+` (`AgentUserRole`), `:25` (`UserRole.AGENT`) ;
`docs/agent-bugs-consolidated.md` (55 findings, 5 CRITIQUE) ; commentaire de
clôture #3727 (2026-09-02).

**Conséquences** : aucun changement de comportement — cette ADR documente une
décision déjà en vigueur (l'agent n'a jamais cessé d'être servi). Les 55
findings documentés restent de la dette RÉELLE sur du code qui reste en
production ; cette ADR ne les corrige pas, elle acte seulement que le service
n'est pas retiré. Toute nouvelle route ou modèle sous `routes/admin/agent-*.ts`
suit désormais le budget de taille standard (1000-1200 lignes) — la
justification « fichier trop gros pour être touché » ne s'applique plus,
`agent.ts` étant passé de 1977 à 85 lignes.
