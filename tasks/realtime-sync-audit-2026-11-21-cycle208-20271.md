## Cycle 208 — la raison unique de la famille « absents du web » était fausse pour quatorze de ses vingt entrées, et sa FORME envoyait écrire un écouteur qui doublerait (#20271)

**Date** : 2026-11-21. **Base** : `dev` à `0111884c9`. **Issue** : #20271.

### D'où vient ce lot

Du cycle 207, qui a réparé le relevé alimentant ce cliquet. Un instrument juste
rend lisible ce qu'il porte : l'inventaire de parité range vingt événements sous
UNE phrase, et la phrase n'avait jamais été confrontée aux sites.

### Le défaut

La famille `absents: ['web']` disait de ses vingt entrées :

> chantier 2.0 : `apps/web` suit l'interface iOS (directive porteur 2026-09-07)
> et ces signaux temps réel ne sont pas encore portés.

**Mesuré, c'est faux pour quatorze d'entre eux** — et ce n'est pas une nuance de
rédaction. « Pas encore porté » décrit un RETARD, donc la raison envoie le lot
suivant ÉCRIRE un écouteur. Pour onze des quatorze, le web reçoit déjà le fait
par un autre chemin : l'écouteur y ferait une **double application**.

| événements | ce que la mesure dit |
|---|---|
| `audio:translation-*` (3) | le site qui diffuse une traduction audio émet, DANS LA MÊME UNITÉ, un `message:attachment-updated` portant la pièce jointe re-sérialisée ENTIÈRE, traduction incluse (`_broadcastTranslationEvent` → `_broadcastAttachmentUpdated`, les trois branches) — et le web l'applique |
| `conversation:joined` · `-left` · `join-error` · `conversation:stats` (4) | le web n'emploie pas ce PROTOCOLE : il n'émet jamais `conversation:join` (`AuthHandler._joinUserConversations` rejoint tout à l'authentification, et `socket.ts` l'écrit en tête), et lit les statistiques par REST |
| `heartbeat:ack` (1) | chemin RETIRÉ par décision au cycle 78 — un écouteur remettrait le battement que ce cycle a supprimé |
| `mention:created` · `user:preferences-reordered` (2) | le fait arrive par un AUTRE canal : la notification pour la mention, l'instantané versionné de `user:preferences-updated` pour l'ordre (`orderInCategory` depuis #18925) |
| `translation:failed` (1) | rien à AFFICHER : une traduction de texte absente fait servir l'original (règle 1 du Prisme), et le web ne rend aucun « en cours de traduction » sur une bulle |

Les SIX restants gardent la raison de chantier, et elle y est juste pour quatre
(aucune surface de réaction par emoji sur un commentaire ni sur une humeur — le
web a les j'aime, branchés) ; les deux autres familles de signaux — position en
direct, enveloppe de bout en bout, traduction d'une story — **n'ont pas été
remesurées**, et leur famille le DIT.

### La leçon

> **La FORME d'une raison fausse décide de l'action fausse qu'elle invite.**
> « Pas encore porté » ⇒ « écris l'écouteur ». « Le protocole n'est pas
> employé » ⇒ « ne touche à rien ». « Retiré par décision » ⇒ « ne le remets
> pas ». Les trois sont des absences ; elles n'appellent pas le même geste, et
> la première est la seule qui ressemble à une dette.

Détail : `tasks/lessons/2026-11-21-la-forme-d-une-raison-fausse-decide-de-l-action-fausse-qu-elle-invite.md`.

Et **une absence de mesure ne doit pas se lire comme une mesure** : la famille
qui reste à instruire le dit dans sa raison, plutôt que d'hériter d'une phrase
qui a l'air d'un constat.

### La preuve

| gate | résultat |
|---|---|
| `vitest run __tests__/ci/` (shared) | **216 verts / 25 fichiers** |
| forme des familles | le cliquet l'exige et l'a exigé : listes TRIÉES, familles non vides, raison écrite — la première rédaction a rougi sur l'ordre des neuf événements de la dernière famille |

Ce lot ne touche aucune ligne de production : il corrige ce qu'un inventaire
AFFIRME. Sa preuve est donc le cliquet lui-même, plus les mesures citées entrée
par entrée — chacune nommant son site, pour être recontrôlable sans refaire
l'enquête.

### Ce que ce lot ne fait pas

- Il ne remesure pas `e2ee:envelope`, `location:live-*` et
  `story:translation-updated` : leur chemin web demande d'instruire trois
  features, pas une phrase. Ils restent dans la famille de chantier, qui le dit.
- Il ne porte aucun écouteur : des quatorze entrées remesurées, **zéro** demande
  un écouteur web — c'est le résultat du lot, pas son absence de résultat.
