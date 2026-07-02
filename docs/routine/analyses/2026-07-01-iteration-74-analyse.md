# Iteration 74 — Analyse d'optimisation (2026-07-01)

## Protocole (démarrage)
`main` @ `57408634` (PR #1316 mergée). Branche de travail `claude/brave-archimedes-i40n2c` recréée à
neuf depuis `origin/main` (`git checkout -B ... origin/main`).

Vérification élargie de l'état des lots consignés (iter 73) :
- **F30 (clipboard)** : `grep navigator.clipboard.writeText / document.execCommand` sur `apps/web`
  (hors `lib/clipboard`, hors tests) → **0 site brut**. Lot **convergé**, rien à faire.
- **F32 (`formatDuration` local → `formatClock`)** : deux remnants encore présents, confirmés vivants
  (`AttachmentDetails.tsx`, `AudioPostComposer.tsx`). **Cible retenue** ci-dessous.

## Cible iter 74 — Convergence finale `formatDuration` → `formatClock` (F32-reste) + dead code

### Current state
La source unique `packages/shared/utils/duration-format.ts` → `formatClock(totalSeconds, { padMinutes,
includeCentiseconds })` (iter 42) unifie déjà `call-summary`, `use-call-duration`, `audio-formatters`,
`NotificationService`, puis (iter 73) `CompactVideoPlayer`, `OngoingCallBanner`,
`AudioEffectsTimelineView`, `LastMessagePreview`. Restaient **deux** réimplémentations locales de
l'algorithme d'horloge MM:SS / H:MM:SS et **une** copie morte.

| Fichier | Entrée | Comportement local | Action iter 74 |
|---------|--------|--------------------|----------------|
| `components/attachments/AttachmentDetails.tsx` | ms | H:MM:SS / M:SS, garde `<=0 → '0:00'` | **converti** (drop-in exact) |
| `components/v2/AudioPostComposer.tsx` | ms | M:SS **sans gestion des heures** | **converti** (+ bugfix rollover heures) |
| `components/video-calls/CallStatusIndicator.tsx` | s | H:MM:SS / M:SS, préfixe `_` (jamais appelé) | **supprimé** (dead code, 11 lignes) |

### Problem identified
1. **Duplication** — trois copies supplémentaires du même algorithme `Math.floor` + `padStart(2,'0')`,
   chacune à maintenir/tester indépendamment. Divergence latente : `AudioPostComposer` n'avait **aucune
   gestion des heures** (un enregistrement ≥ 1 h affichait `61:00` au lieu de `1:01:00`).
2. **Dead code** — `CallStatusIndicator._formatDuration` défini mais jamais référencé (le préfixe `_`
   signale l'intention « unused »), 11 lignes conservées sans usage.

### Root cause
Algorithme d'horloge réimplémenté inline à la création de chaque composant, avant/hors adoption de la
source unique `formatClock`.

### Business impact
FAIBLE-MOYEN. `AudioPostComposer` : rollover d'heures incorrect sur les enregistrements longs (cas rare
mais visiblement faux). `AttachmentDetails` : aucun changement fonctionnel (drop-in). Cohérence globale
du formatage de durée renforcée sur toute la surface web.

### Technical impact
Une seule implémentation d'horloge à tester/maintenir. `AudioPostComposer` hérite gratuitement de la
gestion des heures et du clamp des entrées non-finies/négatives de `formatClock`.

### Risk assessment
**Faible.**
- `AttachmentDetails` : `formatClock(ms/1000)` est **strictement équivalent** à la copie locale
  (`<=0 → '0:00'`, M:SS < 1 h, H:MM:SS ≥ 1 h). Les tests existants (`3:00`, `1:01:01`, `0`, négatif)
  restent verts sans modification.
- `AudioPostComposer` : identique < 1 h, **corrigé** ≥ 1 h.
- `CallStatusIndicator` : suppression pure d'une fonction non appelée — aucun impact runtime.

### Proposed improvement (implémenté)
Les deux `formatDuration(ms)` délèguent à `formatClock(ms / 1000)` (import direct de la source de
vérité `@meeshy/shared/utils/duration-format`, cohérent avec les 6 call-sites existants). Le
`_formatDuration` mort de `CallStatusIndicator` est retiré.

### Expected benefits
- 3 réimplémentations locales de l'algorithme d'horloge supprimées (dont 1 dead code).
- Bugfix rollover heures dans `AudioPostComposer`.
- Convergence F32 **complète** côté horloge (reste hors périmètre : durée **humaine** j/h/min des
  modales admin agent — sémantique distincte, cf. F32-humain).

### Implementation complexity
Très faible — 3 fichiers, +5 / −20 lignes.

### Validation criteria
- [x] `jest` : `AttachmentDetails.test.tsx` + `audio-post-composer.test.tsx` → **60/60 verts**
      (assertions durée inchangées : `3:00`, `2:00`, `1:01:01`, zéro, négatif).
- [x] `CallStatusIndicator` : aucun test ne le référence ; suppression de code mort, non appelé.
- [x] Imports mirroring 6 call-sites existants déjà verts sur `main` (`OngoingCallBanner`,
      `CompactVideoPlayer`, `use-call-duration`, `LastMessagePreview`, `AudioEffectsTimelineView`,
      `audio-formatters`) → résolution garantie par construction.

## Consignés pour itérations futures

| # | Constat | Impact |
|---|---------|--------|
| F32-humain | `TriggerSchedulingModal`/`AgentScheduleTimeline` : durée **humaine** (j/h/min), sémantique ≠ horloge → source unique **distincte** à créer si besoin | FAIBLE |
| F31 | `truncateText` : collision de nom `truncate.ts` (objet) vs `xss-protection.ts` (string) + réimpl. locale `ConversationDropdown.tsx` | FAIBLE |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut — flip = validation staging (non autonome) | HAUT (~75 % BP) |

## Gain
Convergence F32 (horloge) close côté web : plus aucune réimplémentation locale de MM:SS / H:MM:SS hors
la source unique `formatClock`. Bugfix rollover heures `AudioPostComposer`. 11 lignes de code mort
retirées de `CallStatusIndicator`. Tous les tests concernés verts.
