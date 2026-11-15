## Leçon 578 — La graphie du FIL n'est pas la graphie du MAGASIN, et ce qui se perd entre les deux est ce qui ne se regarde pas

2026-09-11, passerelle (audit de cohérence iOS ↔ passerelle).
`POST /posts` accepte une transcription faite sur l'appareil dans la graphie du
client — `duration_ms`, `segments[].start`/`.end` en **secondes**, `speaker_id`.
Les deux services la persistaient **verbatim** (`{ ...data.mobileTranscription,
segments, source: 'mobile' }`) dans `PostMedia.transcription`, dont la graphie
canonique est `durationMs`, `startMs`/`endMs` en **millisecondes**, `speakerId`.

Le texte, lui, porte le même nom des deux côtés. Un audio transcrit sur
l'appareil rendait donc sa transcription — et des segments **sans aucun
horodatage** : pas de surlignage au fil de la lecture, pas de saut à un segment,
durée lue à `0`. Le même enregistrement transcrit par Whisper s'affichait
entièrement.

> **Quand on vérifie qu'une transcription « marche », on lit le texte.** Ce qui
> se perd dans une conversion de graphie est exactement ce que ce regard ne
> couvre pas : le TEMPS, l'unité, l'identité du locuteur. La question à poser à
> tout site qui persiste une charge reçue n'est pas « le champ principal est-il
> là ? » mais **« ce document a-t-il une graphie à lui, et qui la lui donne ? »**

Le dépôt savait. Le chemin TUS l'écrit noir sur blanc — « la forme validée est
celle que le translator lit (`startMs`/`endMs`), pas celle de `POST /posts`
[…] : c'est le lecteur final qui dicte la forme ». La règle était juste et
publiée ; elle n'avait jamais été appliquée là où le lecteur final voulait la
même chose. **Un doc-comment qui NOMME une divergence est un aveu : aller voir
si l'autre moitié a été traitée.**

Parade : un site UNIQUE de conversion, dont le témoin est que sa sortie passe le
validateur du magasin (`parseAttachmentTranscription`) — et dont la
contre-épreuve est que la charge du fil, elle, est refusée. Une garde qui
compare des clefs se contente de décrire ; une garde qui fait valider sa sortie
par le lecteur mesure.

Et l'unité est le piège dans le piège : `start: 12.4` relu comme des
millisecondes donne un segment de 12 ms au lieu de 12,4 s — un décalage qui a
l'air d'un bug de LECTEUR, jamais d'un bug de format.
