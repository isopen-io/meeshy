# Itération 166i — Analyse UI/UX iOS : `MessageTranscriptionDetailView`

**Date** : 2026-07-18
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageTranscriptionDetailView.swift`
**Base** : `main` HEAD (`eb7e162`)
**Branche** : `claude/laughing-thompson-g5cnyn`
**Gate** : CI `iOS Tests`

## Contexte

`MessageTranscriptionDetailView` est l'onglet « Transcription » du détail d'un message audio : bannière
langue + confiance + durée, texte intégral, segments mot-à-mot, bouton « Transcrire » (état vide), et la
liste des traductions audio (TTS) avec badge « Clone ». Surface **non réclamée** par la vague d'agents
(vérifié contre les 30 PR ouvertes 140i→165i — aucune ne touche ce fichier). Numéro **166i** (165i =
`StatsTimelineChart`, PR #2028, la plus haute ouverte).

## Constat (avant 166i)

**Typographie déjà conforme Dynamic Type** : toutes les polices texte sont sémantiques
(`.caption`, `.footnote`, `.subheadline`, `.caption2`, `.system(.caption2, design: .monospaced)` — style
de texte, donc scalable). **Aucune migration `.font(.system(size:))` de libellé nécessaire.** Le **seul**
`.font(.system(size: 28))` est le glyphe hero de l'état vide (`text.word.spacing`) — **décoratif**, à
figer selon la doctrine 84i/86i.

**Lacunes VoiceOver réelles** (le fichier était sans aucun modificateur a11y) :
1. Le **glyphe hero** de l'état vide (28pt) était **exposé à VoiceOver** comme image sans label → bruit.
2. La **bannière langue/confiance** (icône + nom de langue + `95%` + `0:12`) était lue en **4 fragments
   séparés** au lieu d'une annonce cohérente.
3. Trois **glyphes décoratifs de tête de ligne** (`person.2.fill` locuteurs, `translate` traductions
   audio, `person.wave.2` badge Clone) étaient lus par VoiceOver alors que le **libellé texte adjacent
   porte déjà le sens**.

## Corrections appliquées (1 fichier, 0 logique, +9 lignes)

- **Bannière langue/confiance** → `.accessibilityElement(children: .combine)` : VoiceOver annonce
  désormais « Français, 95%, 0:12 » en **un seul élément** (le glyphe `waveform.and.mic` sans label est
  absorbé sans bruit).
- **Glyphe hero état vide** `text.word.spacing` 28pt → **figé** (doctrine 84i/86i) + commentaire +
  `.accessibilityHidden(true)` (**lacune comblée** : le libellé « Aucune transcription » porte le sens).
- **3 glyphes décoratifs** (`person.2.fill`, `translate`, `person.wave.2`) → `.accessibilityHidden(true)`
  chacun (déclutter VoiceOver ; texte adjacent inchangé et suffisant).

## Périmètre / non-régression

- **1 seul fichier**, **0 logique**, 0 mutation d'état, 0 test neuf, **0 clé i18n neuve**, 0 swap de
  palette (déjà tokenisée : `theme.*`, `langColor`, `MeeshyColors.success/info`, Glass déjà adopté).
  `import MeeshyUI` déjà présent.
- Aucun `.font(.system(size:))` de **libellé** — le seul figé est un hero décoratif. Aucune régression
  de layout : les modificateurs a11y n'affectent pas le rendu visuel.
- Aucun test ne référence `MessageTranscriptionDetailView` → aucune régression de test.

## Statut

**TERMINÉE** — `MessageTranscriptionDetailView` : a11y VoiceOver soldée (bannière groupée, hero figé +
masqué, 3 glyphes décoratifs masqués) ; Dynamic Type déjà conforme (polices sémantiques). Ne plus
re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `MessageTranscriptionDetailView` — Dynamic Type déjà conforme (0 migration de libellé) ; VoiceOver =
  bannière langue/confiance `.combine` + hero état vide 28pt figé (doctrine 84i/86i) & `accessibilityHidden`
  + 3 glyphes décoratifs (`person.2.fill`/`translate`/`person.wave.2`) `accessibilityHidden`. 1 fichier,
  0 logique/0 i18n/0 test neuf. **SOLDÉ 166i.**
