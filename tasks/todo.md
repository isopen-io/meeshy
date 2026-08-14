# Cycle — Routine appels audio/vidéo : `CallNotification` distingue enfin 1:1 vs groupe

## Contexte

Routine programmée "audio/video calling continuous improvement" (Principal
Apple Platform Architect / WebRTC / Security scope). Le prompt demande un
audit complet 12 phases (iOS/WebRTC/CallKit/PushKit/sécurité/UX/tests/perf) et
un merge en fin de cycle. Plutôt que de tenter les 12 phases d'un coup — pas
réaliste ni sûr sur du code d'appel — cette exécution reprend le travail de la
routine précédente : `tasks/2026-08-13-group-calls-gap-analysis.md`, dont la
mise à jour du 2026-08-13(3) laissait W6/W7 (UI web groupe) et I1-I7 (mesh iOS
mono-PC) comme prochains candidats.

## Choix du cycle

**Un sous-item précis de W6** : `CallNotification` (bannière d'appel entrant
web) affichait le même texte pour un 1:1 et un appel de groupe — aucun moyen
pour l'appelé de savoir, avant de décrocher, s'il rejoint un appel à deux ou à
cinq. Corrigé en TDD (RED : 5 tests sur `isGroupCall`/`groupSize`, GREEN :
badge « {count} personnes » + sous-titre « Appel de groupe » quand
`participants.length > 2`, inchangé sinon). Détail complet dans le fichier
d'analyse (section « Mise à jour 2026-08-14 »).

## Fichiers touchés

- `apps/web/components/video-call/CallNotification.tsx`
- `apps/web/locales/{en,fr,es,pt}/calls.json` (+`incoming.groupSubtitle`,
  `+incoming.groupCallLabel`)
- `apps/web/__tests__/components/video-call/CallNotification.groupCall.test.tsx` (nouveau)
- `tasks/2026-08-13-group-calls-gap-analysis.md` (journal)

## Gates

- `apps/web` : suite `__tests__/components/video-call/` +
  `__tests__/components/video-calls/` — 36 suites / 182 tests verts.
- `tsc --noEmit` (`apps/web`) : mêmes erreurs pré-existantes qu'avant le
  changement (baseline inchangée), rien de nouveau dans les fichiers touchés.
- 4 locales validées JSON-valides.
- iOS : hors scope de ce correctif (aucun fichier Swift touché).

## Prochains candidats (W6/W7 restants, inchangés)

- Grille adaptative multi-participants (`VideoCallInterface.tsx`, aujourd'hui
  1 plein écran + vignettes flottantes).
- Roster avec états mute/vidéo par participant.
- `onRemove` (déclenché sur déconnexion, `VideoStream.tsx`) reste purement
  local — pas branché sur `DELETE /calls/:id/participants/:pid` pour une
  vraie éviction modérateur.
- Timeout global 45 s (`CallManager.tsx` `CALL_TIMEOUT_MS`) — déjà atténué par
  Vague 113/114 (2026-08-12, clear sur `status === 'active'`, qui se pose dès
  la 1re réponse en groupe) ; à vérifier explicitement par un test group-call
  dédié avant de le déclarer clos.
- i18n groupe pour le reste de l'UI d'appel (roster, toasts join/leave).
- Mesh iOS mono-PC (I1-I7, `tasks/2026-08-13-group-calls-gap-analysis.md`
  §iOS) — le chantier le plus large, non commencé.
