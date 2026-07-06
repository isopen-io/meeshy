# Iteration 42 — Analyse d'optimisation (2026-06-30)

## Contexte
Suite iter 41 (lot « Fluidité du fan-out, cache-first & pureté des types », mergé dans
`main` — vérifié : `Promise.all` sur le fan-out d'invitations dans
`conversations/core.ts`, `isPending`/`isFetching` dans `use-dashboard-data.ts`). Le plan
iter 41 désigne explicitement **F18** (unification des helpers de formatage de durée →
`packages/shared`) comme « le meilleur candidat autonome de forte valeur (“unification”
demandée) une fois le risque de signatures hétérogènes cadré ».

Audit relancé du spectre récent → ancien sur les surfaces testables sur ce runner Linux
(gateway via jest, web via jest, shared via vitest ; iOS/SDK non testable ici).

Baseline mesurée sur ce runner : **shared 1180/1180 vert** (vitest) — la gate bloquante.
Gateway jest opérationnel.

## Audit — constats vérifiés

### 1. Réimplémentation × 5 de l'algorithme d'horloge MM:SS / H:MM:SS (F18 — unification)
Cinq fonctions distinctes réimplémentent **le même algorithme** de rendu d'une durée en
secondes vers `M:SS` / `H:MM:SS`, avec des variantes mineures (zéro-padding des minutes,
centièmes de seconde, unité d'entrée) :

| # | Fichier | Signature | Variante |
|---|---------|-----------|----------|
| 1 | `packages/shared/utils/call-summary.ts:112` `formatCallDuration(seconds)` | secondes | minutes **paddées** (`04:32`) |
| 2 | `apps/web/hooks/use-call-duration.ts:6` `formatCallDuration(totalSeconds)` | secondes | minutes non paddées (`2:45`) |
| 3 | `apps/web/utils/audio-formatters.ts:26` `formatDuration(seconds)` | secondes | minutes non paddées (`3:45`) |
| 4 | `apps/web/utils/audio-formatters.ts:8` `formatTime(seconds)` | secondes | + centièmes (`1:23.45`) |
| 5 | `services/gateway/.../NotificationService.ts:35` `formatDuration(ms)` | **millisecondes** (arrondi) | minutes non paddées |

C'est une violation directe du principe **Single Source of Truth** (CLAUDE.md : « Each
data type has ONE source. No reimplementation »). Deux **collisions de nom** aggravent la
confusion : `formatCallDuration` (shared paddé vs web non paddé) et `formatDuration`
(web secondes vs gateway millisecondes). L'état de l'art est une fonction canonique pure
paramétrée par options, consommée par tous les sites. Impact MOYEN (pureté/unification),
testable shared + gateway, **comportement préservable à l'identique** (chaque site garde
sa sortie exacte via options) donc risque FAIBLE.

### Faux positifs écartés (vérifiés pendant l'audit)
Un agent d'audit a proposé des optimisations gateway ; **revérification au code source** :

- **« Lookups séquentiels parallélisables » `MessageProcessor.ts:1018-1032`** : FAUX
  POSITIF. La 2ᵉ requête (`participant.findUnique`, l.1026) consomme
  `originalMessage.senderId` produit par la 1ʳᵉ (l.1021) — dépendance réelle, non
  parallélisable.
- **« Sur-sélection d'attachments » `MessageProcessor.ts:1038-1040`** : FAUX POSITIF.
  `width`/`height` sont effectivement consommés (`firstAttachmentWidth/Height`,
  l.1059-1060). Tous les champs du `select` servent.
- **« N+1 counts → aggregateRaw » `MessageReadStatusService.ts:199-214`** : RÉEL mais
  **reporté** (F23). Chaque participant a un `floor` distinct (`lastReadAt ?? joinedAt`),
  ce qui rend une agrégation mono-requête complexe et sujette à erreurs sur une donnée
  **visible utilisateur** (compteurs de non-lus). Déjà parallélisé (`Promise.all`). Risque
  trop élevé pour une passe autonome ; à traiter avec audit dédié + couverture.
- **`senderId→userId` `MessageProcessor.ts:984-991`** : marginal (réorganiser le
  `Promise.all` ne supprime aucun aller-retour net). Reporté (F24).

## Décision iter 42 — lot « Source unique du formatage de durée (F18) »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | Créer `packages/shared/utils/duration-format.ts` : `formatClock(totalSeconds, { padMinutes?, includeCentiseconds? })` pur + testé (TDD) ; exporté du barrel `utils`. Migrer `call-summary.ts:formatCallDuration` → `formatClock(s, { padMinutes: true })` | Pureté / SSOT — gate bloquante shared |
| B | `NotificationService.ts:formatDuration(ms)` → `formatClock(Math.round(ms/1000))` | Dédup ; validé gateway jest |
| C | `use-call-duration.ts` + `audio-formatters.ts` : délégation à `formatClock` (sortie préservée via options) | Dédup web |

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut (`MessageHandler.ts:580`) | HAUT (~75 % BP multilingue) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill ; fenêtre de maintenance |
| F18b | Unifier les formateurs de **date relative** (`formatRelativeDate`, `formatConversationDate`, `formatNotificationTimeAgo`, `formatContentPublishedAt`, `transform-conversation.ts:formatRelativeTime`) → shared, i18n-aware | MOYEN | Couplage `t()` + locale ; signatures hétérogènes, refactor à faire d'un bloc avec revue locales |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` (User/Community) | MOYEN | États distincts ; audit sémantique + backfill dédiés |
| F23 | `getUnreadCountsForParticipants` N counts → agrégation mono-requête | MOYEN (BP) | `floor` par participant ; risque sur donnée visible |
| F24 | `senderId→userId` réorganisation `Promise.all` | FAIBLE | Aucun aller-retour net supprimé |

## Gain estimé global
Élimination de **5 réimplémentations** du même algorithme d'horloge au profit d'une
fonction canonique pure et testée dans `packages/shared` — fin des deux collisions de nom
(`formatCallDuration`, `formatDuration`), conformité Single Source of Truth, sortie
préservée octet pour octet sur chaque site appelant. Couvert par la gate bloquante shared
(vitest) + gateway (jest).
