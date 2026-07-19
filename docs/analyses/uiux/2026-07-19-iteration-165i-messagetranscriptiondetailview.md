# Itération 165i — Analyse UI/UX iOS : `MessageTranscriptionDetailView` (VoiceOver)

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageTranscriptionDetailView.swift`
**Base** : `main` HEAD (`efedb69e4`)
**Branche** : `claude/laughing-thompson-smdrpy`
**Gate** : CI `iOS Tests`
**Catégorie** : Accessibilité — VoiceOver (valeur nue hors contexte + fragments non groupés + glyphes décoratifs)

## Contexte

`MessageTranscriptionDetailView` est l'onglet « Transcription » du détail d'un message
audio : bannière langue+confiance, texte plein, segments mot-à-mot, compteur de locuteurs,
état vide avec bouton « Transcrire », et la liste des traductions audio (TTS). Elle a été
**explicitement laissée non traitée** (`sys=1 rel=0 a11y=0`) et nommée comme **candidat d'une
future itération a11y MessageDetail** dans les follow-ups de 160i (`MessageForwardDetailView`)
et le plan 153i.

Numéro **165i** : strictement au-dessus du plus haut dédié existant (164i = `InviteFriendsSheet`).
Aucune analyse dédiée n'existe pour cette surface (vérifié : seuls des liens « sibling/candidat »).

## Constat (avant 165i)

La **Dynamic Type est déjà servie** : la vue emploie des styles sémantiques (`.caption`,
`.footnote`, `.subheadline`, `.caption2`, `.system(.caption2, design: .monospaced)` — tous
scalent). Le **seul** `.font(.system(size:))` est un glyphe décoratif d'état vide 28pt. Le
problème réel est **VoiceOver** :

1. **Bannière langue + confiance + durée** : lue en fragments détachés. Le taux de confiance
   s'affiche « 95 % » → VoiceOver énonce **« 95 % » nu, hors contexte** (impossible de savoir
   que c'est un taux de *confiance* de transcription). La durée « 2:34 » est également détachée.
2. **Glyphe décoratif d'état vide** `text.word.spacing` 28pt : non masqué → annoncé comme image
   anonyme.
3. **Icônes de tête décoratives** appariées à un libellé texte adjacent (`person.2.fill`
   locuteurs, `translate` en-tête traductions, `waveform.and.mic` bouton, symbole d'attachment,
   `person.wave.2` badge cloné) : non masquées → lues en doublon du texte qui les suit.
4. **Rangées multi-parties non groupées** (carte d'attachment ; rangée de traduction audio :
   drapeau + langue + « cloné » + durée + extrait) : VoiceOver crée un arrêt par sous-élément
   au lieu d'une annonce cohérente ; la durée y est encore un « 2:34 » nu.

## Corrections appliquées (1 fichier, 0 logique, 0 changement visuel)

- **Bannière groupée + parlante** : `.accessibilityElement(children: .ignore)` +
  `.accessibilityLabel(transcriptionBannerA11yLabel(...))`. Le helper compose langue + taux de
  confiance **énoncé en clair** (« Transcription en Français, confiance 95 %, durée 2:34 »).
  Arrondi identique au rendu visuel (`%.0f%%` ↔ `Int((conf*100).rounded())`).
- **Durée contextualisée** : `durationA11yLabel(_:)` (« durée 2:34 ») appliqué en
  `.accessibilityLabel` sur la durée de chaque rangée de traduction audio (la bannière la plie
  déjà dans son label composé).
- **Glyphes décoratifs masqués** : `.accessibilityHidden(true)` sur le glyphe d'état vide 28pt
  (laissé **figé** — illustration hors texte, doctrine 74i/86i), et sur les 5 icônes de tête
  décoratives (locuteurs, en-tête traductions, bouton transcrire, symbole d'attachment, badge
  cloné).
- **Rangées groupées** : `.accessibilityElement(children: .combine)` sur la rangée locuteurs, la
  carte d'attachment, l'en-tête « Traductions audio » (+ `.isHeader`) et chaque rangée de
  traduction audio → une annonce cohérente par rangée.

**3 clés i18n neuves, toutes suffixées `.a11y`** (VoiceOver-only, référencées code-only via
`defaultValue` — 0 édition xcstrings, parité 100i/104i/164i) :
`message-detail.transcription.a11y.language`, `message-detail.transcription.a11y.confidence`,
`message-detail.a11y.duration`.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 changement de layout/couleur/copie visible,
  0 test neuf. Modificateurs a11y additifs uniquement (`.accessibilityHidden`,
  `.accessibilityElement`, `.accessibilityLabel`) — aucun impact sur le rendu.
- Le seul `.font(.system(size: 28))` reste **figé** (glyphe décoratif) — juste masqué de VoiceOver.
- Dynamic Type déjà couvert (styles sémantiques) → non re-traité.
- Aucun test ne référence `MessageTranscriptionDetailView` → aucune régression de test.
- Gate = CI `iOS Tests` (pas de toolchain macOS en environnement distant).

## Statut

**TERMINÉE** — l'onglet Transcription est désormais lisible par VoiceOver : confiance et durée
énoncées en contexte, rangées groupées en annonces cohérentes, glyphes décoratifs masqués. Ne
plus re-flagger cette surface pour VoiceOver ni Dynamic Type.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `MessageTranscriptionDetailView` — **165i** : VoiceOver (bannière groupée + confiance/durée
  parlantes via helpers, 5 icônes de tête décoratives masquées, glyphe d'état vide 28pt masqué,
  rangées `.combine`, en-tête `.isHeader`, 3 clés `.a11y` neuves). **SOLDÉ.** Sibling
  `MessageEditsDetailView` reste candidat (`sys=1 rel=0 a11y=0`).
