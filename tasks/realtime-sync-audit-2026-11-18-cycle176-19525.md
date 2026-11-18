# Cycle 176 — le serveur refusait de SERVIR un banni, et le laissait AGIR

*2026-11-18. Branche `claude/exciting-planck-na0b87`, partie de la tête de `dev`
(`c11ad1d149`), qu'elle contient.*

**Livré** : #19525 — les cinq portes des réactions de MESSAGE exigent une
participation VIVANTE. PR #19530.

---

## Le défaut

`PARTICIPATION_VIVANTE` est la loi UNIQUE de l'appartenance — active **et**
`bannedAt` nul ou absent — et son doc-comment la destine à « toutes les portes
de lecture (REST et socket) » en disant que `isActive: true` seul ne suffit pas.
Cinq lookups des réactions de message l'épelaient nu : les deux branches de
`ReactionHandler._resolveParticipantId` (la porte UNIQUE de `reaction:add`,
`reaction:remove` ET `reaction:request-sync`), les deux écritures REST, et la
réaction posée au nom d'un agent.

Émettre un événement socket n'exige aucune appartenance à la room. Un banni dont
la ligne est restée `isActive: true` gardait donc : la persistance d'une
réaction, sa diffusion, sa mise en file hors ligne 48 h, **une notification
poussée à l'AUTEUR du message**, la remontée de la conversation en tête de liste,
et le trombinoscope des réacteurs.

**Les deux AUDIENCES de l'événement que ce handler émet appliquent pourtant la
loi.** Le serveur refusait de SERVIR un banni tout en le laissant AGIR — et c'est
la forme qui rend le défaut repérable : quand la diffusion et la porte n'ont pas
la même définition de « membre », la plus étroite des deux nomme la bonne.

---

## Ce que ce cycle a appris

### Un commentaire peut citer le DÉFAUT comme référence du fichier

La note de `routes/reactions.ts:512` disait : « la LECTURE n'admet que des
participations ADMISES, **comme les deux ÉCRITURES de ce fichier
(`isActive: true`, l. 158 et 354)** ». Deux dérives en une phrase :

- des **numéros de ligne**, qui vieillissent — le dépôt l'écrit déjà pour les
  inventaires (« jamais par numéro de ligne, qui dérive à la première édition ») ;
- la **graphie citée était le défaut**. Posée en référence, elle se relisait
  comme la façon juste d'épeler l'appartenance dans ce fichier.

C'est la famille « un commentaire qui ÉNONCE est une affirmation » (cycle 94)
avec une inversion qui la rend pire : celui-ci n'affirmait pas un fait faux, il
DÉSIGNAIT un défaut comme modèle. La question à lui poser n'est pas « dit-il
vrai ? » — il disait vrai — mais **« ce qu'il montre en exemple est-il juste ? »**

### Un site corrigé sans témoin est un site qu'on peut défaire en silence

Les cinq mutations ont été jouées une par une. **M4 — la porte de l'agent — est
revenue VERTE** : aucun des 411 témoins de la suite du manager ne tenait ce site.
Le correctif était posé, juste, et sans garde.

> La mutation ne sert pas qu'à prouver qu'un témoin tombe. Elle sert à découvrir
> **les sites qu'on vient de corriger et que rien ne tient** — et c'est le seul
> moment où on le saura, parce qu'après la fusion plus personne ne rejouera la
> mutation.

Et le site était le seul divergent d'un fichier qui **importait déjà la loi** et
s'en servait 2 500 lignes plus haut. Une loi présente dans un fichier ne se
propage pas à ses autres requêtes ; elle vaut là où quelqu'un l'a récitée
(leçon 307, dont c'est une instance exacte).

### Un témoin rouge « pour la bonne raison » et un témoin rouge « parce qu'il
### appelle du vide » se ressemblent dans un compte de suites

`handleReactionSync` prend le `messageId` **NU**, pas un objet. Appelé avec
`{ messageId }`, il refusait sur `isValidObjectId` — donc mon témoin **PASSAIT
avant le correctif**, pour une raison qui n'est pas la sienne. Ce qui l'a laissé
passer est l'assertion : `expect.objectContaining({ success: false })` accepte
les deux issues et n'atteste rien.

C'est la leçon du cycle 175 (« le détour n'a été évité que parce que le message
d'échec a été LU ») vue depuis l'autre bord : ici le témoin ne RATAIT pas, il
PASSAIT, et un vert ne se lit pas. Le seul garde-fou est d'**assert sur la RAISON
du refus**, jamais sur sa forme. Chaque refus nomme désormais
`'Could not resolve participant'`.

### Le cliquet qui gardait cette question ne pouvait pas voir ces sites

`conversation-audience-living-participation` (#16690) balaie les AUDIENCES —
`participant.findMany|count` — et **écarte délibérément** tout `where` qui nomme
un membre particulier. Les cinq portes de ce lot sont exactement cette forme
écartée. Le cliquet était vert, et il avait raison de l'être : il mesure une
autre classe.

> **Une classe gardée ne garde pas sa voisine, et l'écart ne se voit pas dans le
> vert du cliquet.** La question à poser à un cliquet n'est pas « est-il vert ? »
> mais **« quelle classe mesure-t-il, et laquelle lui ressemble assez pour qu'on
> le croie plus large qu'il n'est ? »** — ici, « audience » et « porte » sont
> deux ensembles de `Participant` lus par appartenance, et seule la lecture du
> discriminant les sépare. Suivi : #19532, dont le relevé se MESURE avant d'être
> gelé.

### Le budget de taille a changé l'emplacement d'un témoin, pas sa nature

Les deux témoins de la porte de l'agent appartenaient au harnais du manager
(« toute garde de comportement du manager y va »). Ce harnais est **hors budget**
à 8 158 lignes, et le cliquet interdit d'y ajouter une ligne avant d'en avoir
extrait. `jest.mock` étant hoisté par FICHIER, le préambule de mocks ne peut pas
être extrait dans un module importé : les témoins vivent donc dans un fichier à
part, qui construit un VRAI manager — jamais une copie de sa méthode.

Et les deux témoins REST ont été alignés **sans faire grossir leur fichier**
(1 250 lignes, inchangé) : le commentaire qui expliquait le correctif a été
retiré au profit de la loi NOMMÉE dans l'assertion, qui se documente elle-même.

---

## Preuve

- **ROUGE avant implémentation** : 6 témoins sur 8 rouges, les 2 verts étant les
  non-régressions (elles doivent passer avant comme après) ;
- **5 mutations ROUGES**, chacune ancrée sur un motif devant matcher exactement
  une fois et échouant bruyamment sinon — dont M4, verte au premier relevé, qui a
  fait écrire les témoins manquants ;
- `src/socketio` + `src/__tests__/unit/routes` : **16 848 témoins verts**,
  1 087 suites ; `src/__tests__/unit/services` + `security` + cliquets :
  **13 248 verts**, 756 suites ;
- `tsc --noEmit` **EXIT=0** (code de sortie, jamais à travers un pipe) ;
- cliquets de taille (gateway, suites, shared) : **24 verts** ;
- **2 échecs préexistants** : `UploadProcessor.heif-conversion` (`sharp` sans
  codecs HEIC), vérifiés par `git stash` — identiques sans ce lot, comme aux
  cycles 173 à 175.

## Suivis

- **#19522** — un événement que le SDK iOS DÉCODE atteint un consommateur. Mesuré
  dans ce cycle : **5 des 111 sujets** alimentés par une route socket n'ont aucun
  abonné de production — `translation:failed`, `audio:translation-failed`,
  `mention:created`, `conversation:stats`, `conversation:joined`. C'est la limite
  que `socket-event-orphan-gate` ÉCRIT ne pas couvrir (« un nom cité sans être
  branché reste invisible ici »), et que personne n'avait instruite. Le balayage
  naïf se trompe dans le sens RASSURANT : sans dépouiller les commentaires,
  `conversation:joined` passe pour branché — sa seule citation hors plomberie est
  un commentaire qui explique pourquoi on ne peut PAS s'y abonner.
- **#19531** — `LocationHandler` porte le même `isActive` nu, hors de la famille
  des réactions. Laissé dehors PAR DÉCISION : l'arbitrage « resserrer est le seul
  sens qui échoue fermé » ne se transpose pas sans être réinstruit sur un partage
  de position EN COURS.
- **#19532** — élargir le cliquet de #16690 aux PORTES, relevé mesuré et publié
  avant d'être gelé.
- **La consolidation sur `resolveParticipantFromMessage`** — la forme qui
  SUPPRIME la retape au lieu de la corriger, refusée dans ce lot pour deux
  divergences mesurées (garde `isValidObjectId`, repli `participantId || id`).
- **#18760 n'est toujours pas refermé** : les runs `ci.yml` de `dev` concluent
  `cancelled` — mesuré de nouveau ce cycle, le dernier `success` à la tête de
  `dev` datant de quatre fusions en arrière. La CI prend ~3 h 30 et `dev` reçoit
  des poussées bien plus souvent ; la place d'attente du groupe de concurrence
  n'en garde qu'une, donc chaque poussée annule celle qui attendait. `dev` n'a
  pas de verdict à sa tête, et c'est le défaut d'INFRASTRUCTURE que ce cycle n'a
  pas adressé non plus.
