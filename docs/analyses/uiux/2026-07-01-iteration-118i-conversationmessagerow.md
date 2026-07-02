# Itération 118i — Analyse UI/UX iOS : `ConversationView+MessageRow`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift`
**Base** : `main` HEAD (`f07928f1`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

Les affordances de la conversation : barre de recherche, bannière de résultats, pilule
« Messages récents » (retour au bas), barre d'actions de message (réagir/répondre/…),
barre d'échec d'envoi (réessayer/supprimer), pilule de compteur de réponses. **0 PR ouverte
iOS sur ces surfaces** au démarrage (4 PR ouvertes = gateway/calls/web, fichiers disjoints)
→ 0 contention. Numéro **118i** (117i = `StoryViewerView+Canvas` mergé #1337).

## Constat (avant 118i)

**16 `.font(.system(size:))`** : 14 sont du **texte/label réactif** (champ + glyphe de
recherche, bouton « Fermer », bannière de résultats, pilule « Messages récents », barre
d'échec `Échec de l'envoi`/`Réessayer`/`Supprimer`, pilule de réponses) ; 2 sont
l'icône + le micro-label du bouton d'action de message, dans un **cadre tap fixe 60×44**.

## Corrections appliquées (1 fichier, 0 logique)

- **14/16 `.font(.system(size:))` → `MeeshyFont.relative(...)`** : glyphe + champ de recherche
  (14 medium / 15), croix d'effacement (16), bouton « Fermer » (14 medium), glyphe + label de la
  bannière de résultats (12 semibold / 12 medium), glyphe + label « Messages récents » (12 bold /
  12 semibold), glyphe d'échec + `Échec de l'envoi` / `Réessayer` / `Supprimer` (11), glyphe +
  label de la pilule de réponses (10 semibold / 11 semibold).
- **2/16 glyphes figés** + commentaire doctrine : icône (16) + micro-label (9) du
  `messageActionButton`, dans un cadre tap **fixe 60×44** aligné en rangée horizontale (doctrine
  82i — les faire scaler ferait déborder / casser la barre d'actions ; le bouton porte déjà
  `.accessibilityLabel(label)`, donc VoiceOver reste complet).

Palette (`accentColor` déterministe, `MeeshyColors.error`/`textMuted`/`textSecondary`),
`.adaptiveGlass`/`.ultraThinMaterial` et les `.accessibilityLabel` existants déjà conformes → **intacts**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve (toutes déjà `String(localized:)`).

## Statut

**TERMINÉE** — `ConversationView+MessageRow` Dynamic Type + a11y soldé. Ne plus re-flagger les 2
glyphes figés du `messageActionButton` (cadre fixe 60×44).

---

## Analyses corrigées & complètes (ne pas reproduire)

- `ConversationView+MessageRow` — 14 sites texte/label → `relative` ; 2 glyphes figés (icône +
  micro-label du bouton d'action dans un cadre fixe 60×44, doctrine 82i, déjà labellisé VoiceOver).
  **SOLDÉ 118i.**
