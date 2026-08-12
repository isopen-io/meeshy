# Itération 117i — Analyse UI/UX iOS : `StoryViewerView+Canvas`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift`
**Base** : `main` HEAD (`9077eea6`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

Le canvas du viewer de stories : bandeau de réponse au commentaire, overlay de caption vocale
(transcription), emoji de réaction en burst, badge audio de fond, badge de traduction (Prisme
Linguistique), bouton de fermeture preview et cover de chargement. **0 PR ouverte iOS sur ces
surfaces** au démarrage (seule #1335 realtime SDK/gateway ouverte, fichiers disjoints) → 0
contention. Numéro **117i** (116i = `OnboardingAnimations` mergé #1334).

## Constat (avant 117i)

**13 `.font(.system(size:))`** : 10 sont du **texte/label réactif** (libellé « Réponse à », aperçu
de réponse, transcription vocale, titre + uploader du badge audio, code langue du badge de
traduction, pseudo de la cover, glyphes inline de ces badges) ; 3 sont des glyphes en **cadre
fixe / hero décoratif** (2 croix ✕ dans des cercles tap fixes 22×22 et 36×36, 1 emoji de réaction
hero 100pt animé en burst).

## Corrections appliquées (1 fichier, 0 logique)

- **10/13 `.font(.system(size:))` → `MeeshyFont.relative(...)`** : icône + libellé « Réponse à »
  (9/11 semibold), aperçu de réponse (11), transcription vocale (14 medium), `music.note` + titre +
  uploader du badge audio (11 semibold / 12 medium / 11), icône `translate` + code langue du badge
  de traduction (10 semibold / 9 bold monospaced), pseudo de la cover de chargement (15 semibold).
- **3/13 glyphes figés** + commentaires doctrine : croix « annuler la réponse » (9, cadre tap fixe
  22×22, doctrine 82i), croix de fermeture preview (16, cadre tap fixe 36×36, doctrine 82i), emoji
  de réaction hero (100, burst animé, doctrine 84i — déjà `.accessibilityHidden`).
- **`.accessibilityLabel("story.viewer.reply.cancel")`** ajouté sur la croix icon-only d'annulation
  de réponse (la croix de fermeture preview et l'emoji hero étaient déjà labellisés/masqués).

Palette (`reply.authorColor` / `audio` déterministes, `.ultraThinMaterial` des badges) et
animations déjà conformes → **intactes**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 1 clé i18n neuve (`story.viewer.reply.cancel`, avec
  `defaultValue` inline → fonctionne sans éditer `Localizable.xcstrings`).

## Statut

**TERMINÉE** — `StoryViewerView+Canvas` Dynamic Type + a11y soldé. Ne plus re-flagger les 3 glyphes
figés (2 croix en cercles fixes + emoji hero).

---

## Analyses corrigées & complètes (ne pas reproduire)

- `StoryViewerView+Canvas` — 10 sites texte/label → `relative` ; 3 glyphes figés (2 croix cadres
  fixes 22×22 / 36×36, emoji hero 100pt) ; label VoiceOver sur la croix d'annulation de réponse.
  **SOLDÉ 117i.**
