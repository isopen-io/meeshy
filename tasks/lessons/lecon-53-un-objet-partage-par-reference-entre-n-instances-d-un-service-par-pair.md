## Leçon 53 — un objet partagé par référence entre N instances d'un service "par pair" transforme un cleanup local en effet de bord global (routine calling-feature, Vague 32, 2026-07-09)

`use-webrtc-p2p.ts` (web) garde une instance `WebRTCService` **par participant distant** dans un appel de
groupe (`webrtcServicesRef`, une `Map`) — l'intention claire du design est que chaque instance possède SON
PROPRE état de connexion, isolé des autres. Mais `addLocalMedia(stream, …)` leur passe à toutes la MÊME
référence `MediaStream` (celle du store `useCallStore.localStream`, jamais clonée), et
`WebRTCService.close()` faisait `this.localStream.getTracks().forEach(track => track.stop())`
inconditionnellement. `close()` sur UNE instance (`removeParticipant()`, appelé par un vrai
`participant-left` en cours d'appel de groupe, ou par le cleanup d'un échec de négociation limité à UN
pair) stoppait donc les tracks matérielles **utilisées par toutes les autres instances encore actives** —
un participant qui raccroche coupait le micro/caméra de tout le monde, alors que leurs connexions
respectives restaient `connected`. Le vrai propriétaire du cycle de vie du stream partagé existait déjà
ailleurs dans le code (`call-store.ts`'s `reset()`, qui stoppe les tracks UNE SEULE FOIS au vrai teardown
de fin d'appel) — le `close()` par-instance était un second stoppeur, redondant sur le chemin correct
(fin d'appel réelle) et actif-destructeur sur le chemin incorrect (un seul pair qui part).

**Règle réutilisable** : quand une collection tient N instances d'une classe "par pair/par ressource"
(`Map<participantId, Service>`), vérifier si un champ qu'elles reçoivent en construction/attachement est
un objet passé **par référence partagée** (pas cloné, pas recréé par instance) plutôt qu'une ressource
réellement possédée par l'instance. Si oui, toute méthode de cleanup de CETTE instance qui mute cet objet
partagé (`.stop()`, `.close()`, `.clear()`, toute API qui altère l'état plutôt que de simplement cesser de
le référencer) doit soit (a) ne jamais le faire depuis un cleanup "à la portée d'une seule instance", soit
(b) recevoir un paramètre explicite (`{ stopLocalTracks: boolean }`) distinguant "je me détache de la
ressource" de "je termine la ressource pour de bon", avec le vrai teardown final réservé au seul
propriétaire légitime (ici, le store qui a créé le stream). Signature du bug : `close()`/`dispose()`/
`teardown()` sans paramètre, appelé à la fois sur un seul élément d'une collection ET sur la collection
entière, mutant un champ qui s'avère être le MÊME objet dans tous les éléments — un test qui ne construit
qu'UNE instance à la fois ne peut jamais détecter ce genre de fuite inter-instance (c'est exactement
pourquoi aucun des tests `close()` existants ne l'avait attrapé : chacun testait une seule instance avec
son propre stream mocké, jamais deux instances partageant la même référence).

---
