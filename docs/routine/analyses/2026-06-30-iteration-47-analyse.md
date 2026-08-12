# Iteration 47 — Analyse d'optimisation (2026-06-30)

## Contexte
Suite iter 46 (« Source unique du formatage de taille de fichier — F24 », mergée dans `main` :
PR #1136 / squash `a7eadacc`, les 3 réimplémentations web de `formatFileSize` délèguent au
canonique `packages/shared/types/attachment.ts`). Le scout iter 47 a évalué le backlog documenté
puis cherché une nouvelle duplication pure byte-identique, testable sur runner Linux.

Surfaces testables sur ce runner :
- **shared vitest** : baseline **1208/1208 vert** (gate bloquante).
- **web jest** : `audio-formatters.test.ts` couvre le canonique `formatClock` (delegation) ;
  `components/video/VideoPlayer.test.tsx` (58 tests, assertions d'horloge `0:00`/`2:05`/`1:30`/`1:01:05`).

## Triage du backlog (scout iter 47)

| # | Constat | Décision |
|---|---------|----------|
| **F23b** | `getUnreadCountsForParticipants` : `senderId: { not: senderId }` utilise le **paramètre** `senderId` (l'utilisateur dont on calcule le non-lu), pas `participant.id` | **PAS un bug** — logique correcte. Retiré du backlog. |
| **F24b** | Gateway `formatFileSize` FR (`o`/`Ko`/`Mo`) : arrondis **différents** (`toFixed(0)` Ko, `toFixed(1)` Mo) du canonique (`toFixed(2)`+`parseFloat`) | **Risqué** — unifier changerait les chaînes de **notification push visibles**. Reporté (lot i18n dédié). |
| **F25a** | Email : web `xss-protection.ts` réimplémente un `isValidEmail` **laxiste** (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) vs canonique RFC 5322 strict `packages/shared/utils/email-validator.ts` | **Reporté** — déléguer rend la validation **plus stricte** = changement de comportement (rejette des emails auparavant acceptés), pas byte-identique. Nécessite validation des flux avant bascule. |

## Audit — constat retenu (F25c)

L'iter 42 a unifié le formatage d'horloge `MM:SS`/`H:MM:SS` dans le canonique
`packages/shared/utils/duration-format.ts` → `formatClock`, et `apps/web/utils/audio-formatters.ts`
expose déjà `formatDuration(seconds) = formatClock(seconds)`. **Deux copies inline ont échappé** à
ce lot :

### 1. `MessageComposer.tsx:130` — `formatDuration` inline
```ts
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```
Pour `seconds < 3600` (durée d'enregistrement vocal / pièce jointe audio — l'usage réel), sortie
**byte-identique** à `formatClock(seconds)` (`minutesStr = ${minutes}` non-paddé, `:` + `pad2(sec)`).
Pour `≥ 1 h`, le local émet `61:01` là où `formatClock` émet `1:01:01` (plus correct) ; et le local
émet `NaN:NaN` sur entrée non finie là où `formatClock` borne à `0:00`. Le canonique est donc
**byte-identique en usage réel et strictement plus correct aux bords**.

### 2. `VideoPlayer.tsx:27` — `formatDuration` inline
```ts
function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```
Algorithme **identique** à `formatClock` (défaut `padMinutes: false`) sur **toute** la plage :
`hrs>0 → H:MM:SS` (minutes paddées), sinon `M:SS` (minutes non-paddées). Les assertions du test
(`0:00`, `2:05`, `1:30`, `1:01:05`) correspondent **exactement** à `formatClock` ; sur entrée
négative/NaN, `formatClock` renvoie `0:00` (ce que le test attend déjà). Délégation **byte-identique**.

## Décision iter 47 — lot « Source unique du formatage de durée horloge (F25c) »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | `MessageComposer.tsx` : supprimer le `formatDuration` inline, importer `formatDuration` de `@/utils/audio-formatters` (wrapper web du canonique `formatClock`) | Dédup ; byte-identique en usage réel, +correct aux bords |
| B | `VideoPlayer.tsx` : idem | Dédup ; byte-identique sur toute la plage ; `VideoPlayer.test.tsx` 58/58 inchangé |

Gateway `NotificationService.formatDuration` (durées **abrégées** FR `Ns`/`Nmin`/`Nh`/`Nj`,
sémantiquement distinct de l'horloge) reste hors périmètre — pas le même contrat de rendu.

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F25a | Email : web `xss-protection.isValidEmail` laxiste → canonique RFC 5322 | MOYEN | Bascule = validation plus stricte (changement de comportement) ; valider les flux d'inscription/contact d'abord |
| F25b | Validateurs téléphone (web simple + web robuste + gateway) | MOYEN | Stratégies hétérogènes (regex vs libphonenumber country-aware) ; façade à concevoir |
| F24b | `formatFileSize` locale-aware gateway FR | FAIBLE | Change l'arrondi de contenu push visible |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit sémantique + backfill |

## Gain estimé global
Source unique du formatage d'horloge complétée : les **2 dernières réimplémentations inline web**
(`MessageComposer`, `VideoPlayer`) délèguent au canonique `formatClock` (via le wrapper
`audio-formatters`). VideoPlayer byte-identique sur toute la plage ; MessageComposer byte-identique
en usage réel (< 1 h) et strictement plus correct aux bords (H:MM:SS, garde NaN/négatif). Couvert
par la gate shared vitest (`formatClock`) + web jest (`audio-formatters`, `VideoPlayer` 58/58).
