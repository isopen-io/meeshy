# Live Call Captions — Multi-Speaker UI & Translation Toggle — Design

**Date**: 2026-07-11
**Statut**: Approuvé (brainstorming), en attente du plan d'implémentation

## Contexte

Le chantier "Live Call Captions" (`docs/superpowers/specs/2026-07-10-live-call-transcription-design.md`,
plan associé, 7 tâches livrées, commits jusqu'à `f76e5ebd6`) a livré une transcription locale
fonctionnelle. Testé sur device réel par l'utilisateur : les sous-titres captent bien SA propre
voix, mais aucune trace de celle de l'interlocuteur n'apparaissait pendant l'appel.

Investigation : ce n'est **pas un bug**. L'architecture actuelle (chaque device transcrit
uniquement son propre micro, jamais l'audio distant décodé par WebRTC — contournement du
blocage `factory.audioDeviceModule` documenté dans le spec précédent) relaie déjà chaque device
vers l'autre via le gateway (`call:transcription-segment` → traduction ZMQ →
`call:translated-segment`, `CallEventsHandler.ts`). Mais l'interlocuteur n'avait lui-même pas
activé son propre toggle sous-titres — comportement attendu (toggle manuel, jamais
auto-activé, décision produit du spec précédent, confidentialité STT on-device).

Ce chantier ne change donc PAS le pipeline de données. Il construit l'UI/UX manquante pour
exploiter ce qui arrive déjà : distinction visuelle claire par locuteur, restructuration du
layout d'appel pour laisser une vraie place à la transcription, et une bascule
original/traduit — plus un correctif de données nécessaire pour rendre cette bascule possible.

## Objectif & scope

**Palier 1 (ce chantier, prioritaire)** : afficher visuellement la transcription des deux
locuteurs avec un code couleur clair (`<Moi>` en couleur secondaire Meeshy, `<Nom
interlocuteur>` en couleur primaire Meeshy), et restructurer le layout d'appel pour que cette
zone soit un élément structurel (pas un overlay flottant) — avatar/indicateurs compactés et
remontés en haut, zone de transcription entre eux et la barre de contrôle.

**Palier 2 (ce chantier)** : un bouton de bascule global original ↔ traduit pour les messages de
l'interlocuteur (mes propres messages restent toujours dans ma langue, jamais de bascule).

**Palier 3 (hors scope d'implémentation, documenté comme vision)** : doublage vocal temps réel
— baisser le volume de l'interlocuteur et le faire "parler" en voix clonée dans ma langue. Voir
section dédiée en bas.

**Hors scope explicite de ce chantier** :
- Découvrabilité (signaler à l'interlocuteur que mes sous-titres sont actifs) — ticket séparé.
- Auto-activation des sous-titres de l'interlocuteur — reste manuel, décision déjà actée.
- Palier 3 (doublage vocal) — vision uniquement, aucun design technique ici.

## Architecture

Inchangée par rapport au spec précédent — voir son diagramme. Ce chantier est purement
UI + un correctif de mapping de données côté `CallManager.swift`.

### Correctif de données requis (bloquant pour le Palier 2)

`CallManager.swift`, dans l'abonnement à `socket.callTranslatedSegmentReceived`, construit
aujourd'hui :
```swift
text: seg.translatedText ?? seg.text,
translatedText: seg.translatedText,
```
Le texte ORIGINAL (`seg.text`, tel que reçu du wire event `CallTranslatedSegmentData`) est ainsi
perdu dès que la traduction a réussi — `.text` et `.translatedText` finissent par porter la même
valeur (le traduit), et rien ne conserve l'original pour permettre une bascule.

**Nouveau mapping** :
```swift
text: seg.text,                    // toujours l'original, jamais écrasé
translatedText: seg.translatedText,
translatedLanguage: seg.translatedText != nil ? seg.targetLanguage : nil
```
`TranscriptionSegment.text` porte donc désormais TOUJOURS le texte original (local ou distant).
L'affichage choisit `translatedText ?? text` par défaut, ou `text` seul si la bascule "original"
est active — jamais l'inverse implicite d'avant.

## Composants

| Composant | Emplacement | Rôle |
|---|---|---|
| Rendu par locuteur avec nom visible | `CallView.swift` → `transcriptOverlay` (retravaillé) | Remplace le point de couleur actuel par `<Nom> : texte` visible, coloré `MeeshyColors` primary (interlocuteur) / secondary (moi) |
| `showOriginalText: Bool` (nouveau `@State`) | `CallView.swift` | Bascule globale — appliquée uniquement aux segments dont `speakerId != localUserId` |
| Bouton traduction (nouveau, flottant) | `CallView.swift`, à côté de `transcriptionToggleButton` | Visible dès que `transcriptionService.isTranscribing == true` (même condition que le panneau de transcription lui-même) ; toggle `showOriginalText` |
| Layout audio compacté | `CallView.swift` → `audioCallLayout` + `body`'s outer `VStack` | Quand `showTranscript`, `callAvatarPair` réduit (120→56), pills de statut masqués, retrait du `Spacer` qui centrait — le tout remonte en haut |
| Zone de transcription structurelle (audio) | `CallView.swift`, nouvel élément dans le `VStack` principal | Remplace l'actuel overlay flottant (`.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)`) par un élément qui occupe l'espace entre le layout audio compacté et `controlBar` |
| Bandeau transcription (vidéo) | `CallView.swift`, overlay glass en bas de la vidéo | Vidéo garde tout l'écran ; bandeau glass semi-transparent remontant du bas, au-dessus de `controlBar`, ne bloque aucun bouton |

## Flux de données

Inchangé — voir le spec précédent §"Flux de données détaillé". Ce chantier ajoute uniquement,
côté client, la conservation de `seg.text` (original) en plus de `seg.translatedText` dans le
mapping `CallManager.swift`, et la logique d'affichage `showOriginalText`.

## Gestion d'erreurs

Aucun nouveau cas. Si `translatedText` est `nil` (traduction désactivée/langue identique côté
gateway), le bouton de bascule reste sans effet visible (original == "traduit") — pas besoin de
le masquer, la bascule est juste un no-op dans ce cas.

## Tests

- `CallManagerTests` (ou fichier équivalent existant) : test du nouveau mapping —
  `receiveTranslatedSegment` construit un `TranscriptionSegment` dont `.text` est l'original
  (`seg.text`), pas `seg.translatedText`.
- Tests d'inspection de source (pattern déjà utilisé dans `CallSignalIndicatorTests.swift`) :
  présence des couleurs primary/secondary dans `transcriptOverlay`, présence du bouton
  traduction et de son wiring vers `showOriginalText`.
- Validation device réelle obligatoire pour le layout (compactage avatar, bandeau vidéo) — non
  vérifiable en simulateur pour les aspects visuels fins, mais compilable/testable en simulateur
  pour la logique.

## Palier 3 — Vision produit (non planifiée)

Direction à long terme : pendant un appel, une fois l'interlocuteur transcrit et traduit
(Paliers 1-2), permettre de baisser son volume original et de le remplacer par une synthèse
vocale dans la langue de l'utilisateur connecté, en clonant la voix de l'interlocuteur (doublage
temps réel). Le service translator dispose déjà de Chatterbox pour le clonage vocal, utilisé
aujourd'hui en post-traitement (messages audio) — l'extension à un flux temps réel pendant un
appel (latence, streaming TTS, mixage `AVAudioEngine`/WebRTC) est un chantier à part entière,
nécessitant son propre brainstorming quand il sera priorisé. Ce chantier (Paliers 1-2) ne doit
pas fermer cette porte : conserver `text`/`translatedText` séparés (déjà fait ci-dessus) est
justement ce qui permettrait plus tard d'alimenter un pipeline TTS avec le texte traduit sans
retravailler le modèle de données.

## Risques

| Risque | Sévérité | Mitigation |
|---|---|---|
| Restructuration du layout casse l'agencement existant (PiP, effects toolbar, reconnecting banner) | Moyenne | Vérifier manuellement les interactions avec `pipView`, `reconnectingBanner`, `showEffectsToolbar` pendant l'implémentation ; ces éléments existent déjà et ne doivent pas être déplacés par ce chantier |
| Perception de complexité UI en appel (déjà beaucoup de boutons flottants côté droit) | Faible | Le nouveau bouton traduction suit le même pattern vertical déjà en place (`transcriptionToggleButton`), cohérent visuellement |
