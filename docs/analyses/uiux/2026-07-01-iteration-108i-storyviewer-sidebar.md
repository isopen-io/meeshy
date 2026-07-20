# Itération 108i — Analyse UI/UX iOS : `StoryViewerView+Sidebar`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift`
**Base** : `main` HEAD (`100e4725`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

Barre d'actions latérale + header du visualiseur de stories (`StoryActionSidebarView` +
`StoryHeaderView`). **0 PR ouverte** au démarrage (essaim au repos) → 0 contention. Numéro
**108i** (106i pris #1301 AudioEffectsPanel, 107i = `FeedPostCard+Media` mergé #1302).

## Constat (avant 108i)

Les boutons d'action de la sidebar (`StoryActionButton`), le header (avatar/options/close) et
la strip de langues portaient déjà de bons libellés VoiceOver au niveau bouton. Défaut restant :
**10 `.font(.system(size:))`** non scalables (Dynamic Type). Répartition :
- **6 textes du header** (`StoryHeaderView`) : nom d'auteur, `timeAgo`, glyphe repost inline,
  mention « via @… », glyphe horloge inline, temps restant.
- **4 glyphes de contrôle** dans des cadres de dimension fixe : drapeau de langue (cercle 38×38),
  `plus` (cercle 38×38), `ellipsis` (chrome 36×36), `xmark` (chrome 36×36) — chacun déjà pourvu
  d'un `.accessibilityLabel` au niveau du bouton parent.

## Corrections appliquées (1 fichier, 0 logique)

- **6/10 `.font(.system(size:))` → `MeeshyFont.relative(...)`** (weight préservé) : nom d'auteur (15),
  `timeAgo` (12), glyphe repost `arrow.2.squarepath` (10), « via @… » (11), glyphe `clock` (9),
  temps restant (12).
- **4/10 glyphes figés** + commentaires doctrine : drapeau (cercle fixe 38×38, doctrine 86i),
  `plus` (cercle fixe 38×38, 86i), `ellipsis` (cadre chrome 36×36, doctrine 82i), `xmark`
  (cadre chrome 36×36, 82i). Tous déjà étiquetés VoiceOver au niveau bouton → pas de masquage requis.

Palette (indigo, `Color(hex: avatarColor)` déterministe) et Liquid Glass (`.ultraThinMaterial`
des boutons chrome + capsule de la strip) déjà conformes → **intacts**.

## Différé (hors périmètre 108i)

- Le bouton profil du header porte un `.accessibilityLabel` override (« Profil de X ») qui masque
  la lecture VoiceOver du `timeAgo` / temps restant. Ajouter un `.accessibilityValue` avec ces
  métadonnées serait une amélioration réelle → différé 109i+ (touche la sémantique du bouton).

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve (les labels existaient déjà).

## Statut

**TERMINÉE** — `StoryViewerView+Sidebar` Dynamic Type soldé. Ne plus re-flagger les 4 glyphes figés.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `StoryViewerView+Sidebar` — 6 textes header → `relative`, 4 glyphes de contrôle figés (cercles/
  chrome, déjà étiquetés bouton). **SOLDÉ 108i.** Différé : `.accessibilityValue` timeAgo/expiry sur le bouton profil.
