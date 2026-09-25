## Leçon 215 — un champ nommé `participantId` peut désigner DEUX clés Prisma différentes selon l'événement qui le porte ; le nom seul ne prouve jamais l'espace d'identité (2026-08-17, routine calling, cycle 140)

**Le constat.** Les Vagues 132/133 avaient documenté et fermé la confusion `userId` vs.
`participantId` (`CallParticipant.participantId`, FK vers `Participant.id`) pour
`call:quality-alert`/`call:screen-capture-alert`/`call:participant-left`. La Vague 140 a trouvé un
quatrième site, `call:media-toggled`, où le même champ **littéralement nommé `participantId`**
porte une valeur d'un troisième espace d'identité : côté serveur, `resolveActiveCallParticipantId`
renvoie la FK `CallParticipant.participantId` ; côté client, `call-store.ts`'s `updateParticipant`
ne matche que `CallParticipant.id` — la clé primaire de la ligne de participation elle-même, une
troisième valeur, disjointe des deux premières. Par comparaison, `call:participant-left`'s propre
`participantId` porte, lui, exactement cette clé primaire (`participation.id`) — le nom du champ
est donc **identique sur les deux événements, mais leur valeur vit dans deux tables Prisma
différentes** (`CallParticipant.id` vs. `CallParticipant.participantId`), et rien dans le type
TypeScript ni le nom ne le distingue.

**Pourquoi c'est resté invisible aux Vagues 132/133.** Ces vagues avaient scopé leur audit aux
émetteurs passant par `resolveActiveCallParticipantId`/`resolveActiveCallParticipant` ET vérifié
la cohérence `userId`/`participantId` — mais elles n'ont jamais énuméré CHAQUE consommateur CLIENT
de CHAQUE champ nommé `participantId`, ni vérifié que le champ CIBLE (ici, `p.id` dans
`call-store.ts`) est bien dans le MÊME espace que le champ SOURCE de l'événement. Un audit qui
vérifie « le champ `userId` est-il présent et cohérent » peut rester aveugle à un mismatch qui ne
porte même pas sur `userId` — il porte sur `participantId` lui-même, dont deux définitions
légitimement différentes coexistent dans la codebase (le PK d'une ligne de participation CE call,
et la FK vers la ligne de participation de la conversation).

**Le tell, à nouveau.** Un test existant (`call-store.test.ts:409-422`) codifiait
`updateParticipant('participant-1', …)` comme correct contre un fixture dont `.id === 'participant-1'`
— une coïncidence de nommage entre la string de test et le champ `.id`, exactement le même type de
faux témoin que Vague 132 avait trouvé (`userId` et l'id d'alerte partageant la même string dans le
fixture). **Aucun test ne reliait le payload RÉEL du gateway au store** — le grep
`media-toggled`/`handleMediaToggle` sur tous les tests web ne retournait aucun résultat avant cette
vague : le câblage socket→store pour l'indicateur mute/caméra distant n'avait jamais été testé
bout-en-bout.

**La règle.** Deux champs qui portent le MÊME NOM sur deux événements Socket.IO différents ne
portent pas nécessairement la MÊME clé Prisma — vérifier, pour chaque émetteur, quelle colonne
alimente réellement la valeur (grep la ligne d'assignation côté serveur), puis, pour chaque
consommateur, quel champ du modèle CLIENT il matche (grep le predicate de recherche/mise à jour),
et confirmer que les deux désignent la MÊME table.ID — jamais déduire l'équivalence du nom du champ
JSON seul. Le corollaire de la Leçon 213 s'applique en miroir ici : une déclaration de conformité
antérieure (« ce champ suit le contrat `userId`/`participantId` établi ») doit être retracée
émetteur par émetteur, jamais héritée d'un événement voisin qui portait le même nom de champ pour
une valeur différente.
