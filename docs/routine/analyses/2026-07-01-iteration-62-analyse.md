# Iteration 62 — Analyse d'optimisation (2026-07-01)

## Contexte
Suite iter 60 (« Source unique du prédicat d'expiration » — `isExpired`, mergée dans `main` :
PR #1199 / `7f72782`). Le plan iter 60 (§ Continuité) désigne pour iter 61+ un **nouveau scout** (le label « iter 61 » a été pris en parallèle par #1201 « formatCompactNumber » — cette piste, disjointe, prend donc le slot **iter 62**), avec
comme pistes : `formatCountdown` (granularité seconde), slug/url, sanitize, validateurs téléphone (F25b).

Deux scouts parallèles (balayage `apps/web`) ont convergé sur un même verdict : le **plus gros gain
propre** est le **formatage de durée média** (`MM:SS` / `H:MM:SS`). Une **source unique existe déjà**
(`formatClock` dans `@meeshy/shared/utils/duration-format.ts`, exposée côté web via le wrapper
`apps/web/utils/audio-formatters.ts` → `formatDuration`), mais **6 lecteurs média la ré-implémentent
inline à l'identique**. C'est exactement le motif « convergence vers une source unique déjà en place »
des iters 58 (`classifyRelativeTime`), 59/60 (domaine expiration).

## Constat — 6 réimplémentations du formateur de durée média

| Fichier | Fn locale | Forme | Équivaut à |
|---------|-----------|-------|-----------|
| `components/v2/AudioPlayer.tsx:23` | `formatTime(sec)` | `${floor(sec/60)}:${pad2(sec%60)}` + garde `!isFinite\|<0 → 0:00` | `formatClock` (MM:SS, <1 h) |
| `components/v2/MediaAudioCard.tsx:92` | `formatTime(sec)` | idem | `formatClock` (MM:SS, <1 h) |
| `components/video/VideoControls.tsx:46` | `formatTime(sec)` | idem + garde `isNaN` | `formatClock` (MM:SS, <1 h) |
| `components/video/VideoLightbox.tsx:344` | `formatTime(sec)` | idem + garde `isNaN` | `formatClock` (MM:SS, <1 h) |
| `components/v2/MediaVideoCard.tsx:81` | `formatDuration(sec)` | `H:MM:SS` si `hrs>0`, sinon `MM:SS` (**aucune** garde nulle) | `formatClock` (**exact**) |
| `components/audio/SimpleAudioPlayer.tsx:350` | `formatDuration(sec)` | `H:MM:SS`/`MM:SS` + garde `!seconds\|!isFinite → 0:00` | `formatClock` (**exact**) |

### Source unique existante
`packages/shared/utils/duration-format.ts` → `formatClock(totalSeconds, { padMinutes, includeCentiseconds })`.
Wrapper web (13 consommateurs déjà convergés) : `apps/web/utils/audio-formatters.ts` →
`formatDuration(sec) = formatClock(sec)` (sans centisecondes) et `formatTime(sec) = formatClock(sec, { includeCentiseconds: true })`.

Le contrat visé par les 6 lecteurs (**MM:SS / H:MM:SS sans centisecondes**) correspond **exactement**
à `formatDuration`. `formatClock` : `< 1 h → ${minutes}:${pad2(sec)}` (minutes non paddées) ;
`≥ 1 h → ${hours}:${pad2(min)}:${pad2(sec)}` ; non-fini/négatif → `0:00`.

### Problèmes (cohérence + état de l'art)
1. **Réimplémentation ×6** d'un formateur trivial mais à cas-limites subtils (arrondi, garde nulle).
2. **Deux bugs latents** dans les copies « nues » :
   - **`MediaVideoCard.formatDuration` n'a aucune garde** : `NaN`/`undefined` (durée vidéo absente) →
     `"NaN:NaN"`. `formatClock` renvoie `"0:00"`.
   - Les **4 variantes `formatTime` MM:SS-only** rendent une durée ≥ 1 h comme `"61:01"` (61 minutes)
     au lieu du canonique `"1:01:01"`. Sur des vidéos longues (`VideoControls`/`VideoLightbox`) c'est
     un affichage **incorrect**. La convergence corrige ce cas (vrai `H:MM:SS`).
3. **Maintenance N×** : tout ajustement de format doit être répliqué 6 fois.

## Décision iter 62 — lot « Source unique — formatage de durée média (F29) »

Converger les 6 lecteurs sur `formatDuration` de `@/utils/audio-formatters` (suppression des fonctions
locales, import du canonique). Deux sites (`MediaVideoCard`, `SimpleAudioPlayer`) portent déjà le nom
`formatDuration` → sites d'appel **inchangés**. Les 4 sites `formatTime` → import + renommage des appels
en `formatDuration` (le `formatTime` exporté ajoute des centisecondes, non voulu ici).

### Garanties de non-régression
- **Équivalence exacte** pour `< 1 h` (sites `formatTime`) : `${floor(s/60)}:${pad2(s%60)}` ≡ `formatClock`
  (division entière identique ; minutes non paddées ; garde `0:00` préservée).
- **Identité exacte** pour `MediaVideoCard`/`SimpleAudioPlayer` (`H:MM:SS`/`MM:SS`), la convergence
  ajoutant en prime la **garde nulle** manquante à `MediaVideoCard`.
- **Amélioration** (≥ 1 h) : `formatClock` produit le vrai `H:MM:SS` là où les 4 `formatTime` produisaient
  `61:01`. Cas non couvert par les tests existants → aucune régression de test, gain réel de correction.
- Tests : `audio-formatters.test.ts` **31/31** (2 cas ajoutés : négatif → `0:00`, roulement min→h) ;
  `SimpleAudioPlayer.test.tsx` (dont `1:01:05` ≥ 1 h), `VideoLightbox.test.tsx`, `VideoPlayer.test.tsx`
  verts ; **25 suites audio/video/attachments → 640 tests** verts.
- `tsc --noEmit` : **0 nouvelle erreur** (26 erreurs pré-existantes identiques baseline vs working sur
  les 6 fichiers — casts `unknown` fullscreen, types de traduction — hors périmètre).

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F29b | Autres formateurs durée **ms-based** (`AgentScheduleTimeline`/`TriggerSchedulingModal` `formatDuration(ms)` « 1min »/« 1h23 », `LastMessagePreview`, `AudioEffectsTimelineView`) | FAIBLE | Format distinct (non-clock) → source unique séparée à créer |
| F28c | `formatFileSize` local (`media-compression`, `AttachmentDetails`) + inline KB-only (`UserMediaSection`, `AudioRecorderCard`, `AudioFilePreview`) → canonique `@meeshy/shared/types/attachment` | MOYEN | Sorties divergentes (KB-only) → changement visible à cadrer |
| F30 | `escapeHtml` dupliqué (`xss-protection.escapeAttribute` vs `markdown/security/sanitizer.escapeHtml`) | FAIBLE | Sécurité — 2 sites identiques, convergence propre |
| F25b | Validateurs téléphone | MOYEN | Contrats incompatibles |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | HAUT (~75 % BP) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` | MOYEN | Audit + backfill |

## Gain
Domaine **formatage de durée média** unifié : 6 réimplémentations supprimées, tous les lecteurs
audio/vidéo délèguent à la source unique `formatClock` (via `audio-formatters.formatDuration`). Deux
bugs latents neutralisés (`NaN → "0:00"`, vraies durées `H:MM:SS ≥ 1 h`). Cohérence d'affichage garantie
sur tout le produit, maintenance centralisée. Prochain grain : formateurs durée ms-based (F29b),
`formatFileSize` (F28c), `escapeHtml` (F30).
