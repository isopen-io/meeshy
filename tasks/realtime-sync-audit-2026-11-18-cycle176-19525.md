# Cycle 176 — le serveur refusait de SERVIR un banni, et le laissait AGIR

*2026-11-18. Branche `claude/exciting-planck-na0b87`. Partie de `c11ad1d149`, puis
`origin/dev` re-fusionnée à `765e011b6` avant la livraison — c'est CE SHA que la
branche contient (#18654), et les gardes ont été rejouées sur l'arbre fusionné.*

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
- **7 mutations ROUGES**, chacune ancrée — et la première rédaction de ce
  paragraphe annonçait « 5 mutations ROUGES », ce qui était **FAUX**. Voir
  § « Ce que l'audit adversarial a cassé » : deux des trois sites REST sont
  byte-identiques, une seule mutation les avait changés TOUS LES DEUX, et le
  rouge unique venait du seul témoin du POST. Le DELETE n'était tenu par rien ;
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

---

## Ce que l'audit adversarial a cassé

Le `CLAUDE.md` racine envoie tout lot de **contrôle d'accès** par
`auditeur-adversarial` avant fusion. Il a trouvé deux défauts dans MON lot, et
les deux sont des leçons que ce même lot s'attribuait.

### Un site corrigé sans témoin — le cinquième, après que le quatrième ait servi de leçon

`routes/reactions.ts:356`, la résolution du **DELETE REST**, n'était tenue par
rien. Mesuré : remettre ce seul site au défaut laissait **892 témoins de réaction
et 329 témoins de sécurité VERTS**.

La cause est structurelle, et c'est « un double mente aussi par ce qu'il
ACCEPTE » (cycle 112) porté au contexte d'**AUTH** :
`reactions-routes.test.ts` donne par DÉFAUT un `participantId` à un contexte
`registered` — **une forme que la production ne produit jamais**
(`middleware/auth.ts` ne le pose que pour un invité de lien). Les quatorze
témoins du bloc DELETE n'entraient donc JAMAIS dans la branche de résolution,
et la suite ne portait que deux assertions de projection : le POST et le GET.

> **Un double d'identité qui porte plus que la production rend inatteignable la
> branche qu'on croit tester.** La question à poser à un contexte de test n'est
> pas « est-il valide ? » mais **« la production le compose-t-elle ainsi ? »** —
> ici un champ EN TROP, pas un champ manquant, et c'est le sens qui ne se voit
> pas : un contexte trop riche fait passer les témoins.

### Et ma preuve publiée était fausse

J'ai annoncé « 5 mutations ROUGES, chacune ancrée sur un motif qui doit matcher
EXACTEMENT une fois ». La mutation M3 portait sur un motif présent **deux fois**
— j'avais écrit `assert s.count(old) == 2` et lu le couple comme « les deux
écritures REST d'un coup ». Les deux sites changeaient ensemble, un seul témoin
tombait, et j'en ai conclu que les deux étaient tenus.

> **Une mutation qui change DEUX sites ne prouve qu'un seul témoin.** L'ancrage
> « exactement une occurrence » est la discipline que je récitais dans la même
> phrase, et le `== 2` l'annulait à voix haute. Sur des sites byte-identiques,
> l'ancrage ne peut pas être textuel : il doit être **par LIGNE**. Les trois
> sites REST tombent désormais séparément — l.160 : 3 échecs, l.356 : 2 échecs,
> l.571 : 1 échec.

### Mes témoins ne gardaient qu'une moitié de la loi

Troisième constat, et il tenait à mes gabarits : tous portaient `isActive: true`,
si bien qu'une loi **amputée de `isActive`** laissait les trois suites VERTES
(mesuré : 60 témoins verts). La forme de la loi est ancrée ailleurs —
`services/attachments/__tests__/fileReaderAdmission.test.ts`, qui TOMBE sous
cette mutation — et c'est juste : une seule source. Mais le journal laissait
croire que mes mutations la couvraient.

Réparé aux trois portes : un gabarit `isActive: false` (le membre SORTI) tient
désormais la seconde moitié là où la décision se prend.

### Et mon double interprétait le `where` à la main

Les deux suites socket recopiaient un interpréteur de `where`
(scalaires + disjonction `isSet`). `__tests__/helpers/mongo-where.ts` existait,
et son doc-comment dit exactement pourquoi il ne faut pas le doubler : « une
seconde jumelle de cette règle serait libre de diverger de la première ». Les
trois suites passent désormais par `findFirstIn`.

> **Avant d'écrire un double qui interprète une sémantique, chercher le helper
> qui la porte.** Je l'ai écrit deux fois dans le même lot sans le chercher une
> seule — et le dépôt proscrivait nommément ce que je faisais.

## Suivis ouverts par l'audit

- **#19603 — la RÉTRACTATION a reçu un arbitrage que le dépôt réserve au produit.**
  `ReactionService.ts:304-318` tranche, pour l'axe CLÔTURE, qu'« un conteneur
  mort continue d'admettre le RETRAIT de ce qu'il porte déjà » — et dit qu'étendre
  la garde au retrait « demande un arbitrage produit et non un correctif ». Ce
  lot l'a étendue sur l'axe BANNISSEMENT sans le dire. Le témoin qui gèle ce
  choix n'a pas rougi parce qu'il garde l'autre axe : « une classe gardée ne
  garde pas sa voisine », deux fois dans le même lot.
- **#19604 — `ReactionService.ts:116` et `:172`, le point de CONVERGENCE des
  quatre transports, épelle encore `isActive: true` NU**, là où la jumelle du MESSAGE
  applique la loi à son propre point de convergence
  (`MessagingService.ts:180`, `:202`). Aucun trou vivant (les cinq portes
  ferment avant), mais c'était le correctif à UN site plutôt qu'à cinq.
- **`agent-response-bridge.ts:174`**, jumeau immédiat du site de l'agent, et
  **huit sites qui RETAPENT `{ isActive: true, ...unsetOrNull('bannedAt') }`**
  au lieu de la constante : la jumelle divergente exacte que la thèse du lot
  condamne. À compter dans le relevé de #19532.
- **La population `isActive: true ∧ bannedAt ≠ null` n'est comptée nulle part.**
  La valeur du lot comme son risque de disponibilité reposent sur un ensemble
  que personne n'a mesuré ; une mesure sur staging avant promotion serait
  honnête.
