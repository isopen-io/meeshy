# Itération 163i — Analyse UI/UX iOS : `AudioCarouselView`

**Date** : 2026-07-18
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/Bubble/AudioCarouselView.swift`
**Base** : `main` HEAD (`12bf80a`)
**Branche** : `claude/laughing-thompson-rqaav8`
**Gate** : CI `iOS Tests`

## Contexte

`AudioCarouselView` est le carrousel horizontal rendu par une bulle qui porte **plusieurs pistes
audio** (attachments audio d'un même `Message`). Chaque page réutilise `AudioMediaView` ; le carrousel
n'ajoute qu'un footer partagé + un **indicateur de page** en overlay (coin haut-droit). Surface **fraîche**
(0 mention dans le tracking). Numéro **163i** (la traîne 162i `StoryViewerView+Content` était le dernier
lot iOS en vol ; ce fichier n'entre en contention avec aucune PR ouverte).

## Constat (avant 163i)

Deux lacunes réelles, toutes deux dans `pageIndicator` :

1. **Dynamic Type** — le compteur textuel (variante > 7 pistes) `Text("n / N")` était figé à
   `.font(.system(size: 12, weight: .bold, design: .monospaced))` → ne scalait pas sous Dynamic Type. C'est
   un **vrai libellé** dans une capsule à **padding flexible** (horizontal 10 / vertical 5, **aucune largeur
   fixe**) : elle grandit avec les glyphes, donc pas de troncature → `relative`, pas de gel.

2. **VoiceOver / « ne jamais reposer sur la seule couleur »** — la position courante était signalée
   **uniquement** par le remplissage/la taille des points (variante ≤ 7 pistes) ou par le texte brut
   « 2 / 5 ». Aucun `accessibilityLabel` : un utilisateur VoiceOver n'entendait pas quelle piste est active
   (les points ne sont que des `Circle` décoratifs sans sémantique ; le « 2 / 5 » brut est lu littéralement,
   sans contexte « piste »).

## Corrections appliquées (1 fichier, 0 logique)

- **`.font(.system(size: 12, …))` → `MeeshyFont.relative(12, weight: .bold, design: .monospaced)`** : le
  compteur scale désormais sous Dynamic Type (weight + `.monospaced` préservés).
- **VoiceOver** : les deux variantes (points ≤ 7 / compteur > 7) sont enveloppées dans un `Group` unique
  portant `.accessibilityElement(children: .ignore)` + `.accessibilityLabel` → **« Piste 2 sur 5 »** (clé
  i18n `bubble.audio.carousel.position`, extraite au String Catalog). Un seul élément combiné parle pour
  l'indicateur, quelle que soit la variante — la position n'est plus laissée à la seule couleur/taille.

Aucun gel : la capsule du compteur n'a pas de dimension fixe (padding flexible) → `relative` légitime.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf. `import MeeshyUI` déjà présent
  (`MeeshyFont`). 1 clé i18n neuve (`bubble.audio.carousel.position`, auto-extraite comme les clés
  `bubble.*` existantes).
- La logique de paging, de debounce de lecture (`pendingPlayTask`), de footer par-piste et de hauteur
  adaptative n'est **pas** touchée. Palette (points `Color(hex: contactColor)` + `.ultraThinMaterial`) déjà
  conforme → intacte.
- Aucun test ne référence `AudioCarouselView` → aucune régression de test.

## Statut

**TERMINÉE** — `AudioCarouselView` Dynamic Type + VoiceOver soldés (compteur → `relative` ; indicateur de
page annoncé « Piste X sur Y »). Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `AudioCarouselView` — compteur `n / N` (variante > 7 pistes) → `MeeshyFont.relative(12, .bold,
  .monospaced)` (capsule à padding flexible, pas de gel) ; indicateur de page (points ≤ 7 **et** compteur)
  enveloppé en un `accessibilityElement(children: .ignore)` + label « Piste X sur Y »
  (`bubble.audio.carousel.position`) — la position n'est plus portée par la seule couleur. **SOLDÉ 163i.**
