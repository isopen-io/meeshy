# Cycle 166 — les deux canaux frères, et le filtre qui ne filtrait rien

*2026-11-15. Branche `claude/exciting-planck-kexumt`, repartie de la tête de
`dev` (`2e6b39e80`) après la fusion du cycle 165.*

**Livré** : #18623 — `transcription:ready` et `audio-translation:*` appliquent le
plancher d'historique.

---

## Ce que le cycle 165 avait laissé ouvert

Son audit adversarial d'avant-fusion avait mesuré que le lot ne fermait **qu'un
canal sur trois**. Les deux frères partaient nus, depuis la MÊME fonction, sept
lignes plus haut :

| site | ce qui partait |
|---|---|
| `MeeshySocketIOManager.ts:2466` — `transcription:ready` | `transcription.text`, `segments`, `speakerAnalysis` |
| `:2621` — `audio-translation:*` | le texte traduit, `segments`, **et l'URL de la piste TTS** |

L'invité entré par un lien qui refuse l'historique est dans `conversation:<id>`
dès le handshake : il recevait le texte intégral **une milliseconde avant** la
garde du site voisin.

## Le correctif

Un site unique, `socketio/flooredAudience.ts`, parce que la règle valait déjà
pour deux sites et qu'**une règle à retaper est une règle qu'un site finira par
ne pas avoir** :

- `flooredAudience()` rend les rooms à EXCLURE, ou `'unknown'` ;
- `targetWithout()` ampute la cible, et rend `null` quand la cible ne sait pas
  exclure alors qu'il FAUT exclure — la porte échoue en montrant MOINS.

**`emitToConversationParticipants` ne convenait pas** : il chaîne la room de
conversation AVEC les rooms personnelles, ce qui ÉLARGIRAIT l'audience de ces
deux événements. On veut celle d'aujourd'hui, moins les exclus — jamais plus.

Le helper est générique, donc la porte d'émission typée est PRÉSERVÉE : aucun
cast, et `emitServerEvent` reste le seul effacement du dépôt.

## Le témoin qui ne pouvait pas tomber, trouvé par la mutation

Les cinq témoins passaient. La mutation **une par une** — la discipline que
l'audit du cycle 165 a imposée — a rendu :

| mutation de production | témoins qui tombent |
|---|---|
| exclusion retirée au site TRANSCRIPTION | 1 |
| garde `'unknown'` retirée | 1 |
| exclusion retirée au site AUDIO | **0** |

Le témoin audio filtrait `s.event.startsWith('audio-translation')` quand
l'événement s'appelle **`audio:translation-ready`**. Le filtre ne rendait rien,
`toEqual([])` était trivialement vrai, et la garde n'était prouvée par rien.

Réparé (constante + le helper `reaches` de son voisin, plus un témoin jumeau sur
le lecteur AUTORISÉ), les trois mutations tombent désormais chacune sur un
témoin.

> **Deux cycles de suite, deux mécanismes, un seul symptôme.** Au 165, une clé
> d'environnement absente rendait une branche inatteignable ; ici, un préfixe
> deviné vidait un filtre. Dans les deux cas le ROUGE en BLOC était vert sur la
> garde la plus sensible. Détail :
> `tasks/lessons/2026-11-15-un-filtre-qui-ne-rend-rien-rend-l-assertion-trivialement-vraie.md`.

## Preuves

| preuve | résultat |
|---|---|
| mutation, une par une | 3 gardes, 3 témoins qui tombent (1 chacun) |
| `src/socketio` | 151 suites / 2493 témoins |
| voie de parité (commande exacte de la CI) | journal vert ; 4 échecs HEIC environnementaux (`heif-convert`, `jpegtran`, `avifenc` absents du conteneur, installés par la CI) |
| `tsc --noEmit` passerelle | EXIT=0, lu hors pipe |

## Ce qui reste ouvert sur cette chaîne

| # | ce que c'est |
|---|---|
| #18615 | le plancher est appliqué à l'ENFILEMENT, pas au DRAIN |
| #18616 | une seconde instance de file jamais drainée ni purgée sert le pipeline média |
| #18622 | `currentUserReactions` par lecteur dans une charge partagée |
