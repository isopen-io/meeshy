## Cycle 206 — un droit révoqué en direct n'atteignait pas le web, et le commentaire qui nommait ses consommateurs était faux dans les DEUX sens (#20228)

**Date** : 2026-11-21. **Base** : `dev` à `0111884c9`. **Issue** : #20228.

### D'où vient ce lot

Le SECOND constat de l'audit des mutations du cycle 204, laissé OUVERT dans son
journal et nommé une seconde fois par le cycle 205 comme ce qu'il ne faisait
pas : « la règle de lecture n'y est pas la même — une charge RÉDUITE dont il faut
discriminer la PRÉSENCE de clé, jamais recopier la valeur — et la mélanger
ferait écrire le mauvais applieur. »

### Le défaut

`participant:rights-updated` part vers TROIS audiences depuis #3898 : la room de
conversation (charge RÉDUITE, `canViewHistory` retiré par #4009), la room
personnelle du sujet et celle des autres hôtes (charge COMPLÈTE). iOS et Android
l'appliquent à la fiche de participant ouverte.

**Le web n'avait AUCUN consommateur.** Mesuré :
`grep -rn "rights-updated\|PARTICIPANT_RIGHTS_UPDATED\|historyVisibleFrom" apps/web/src`
⇒ **0 occurrence**.

Conséquence produit, et elle frappe la population qui vit précisément sur le web :
les droits booléens ne se pilotent que sur un participant **sans compte**
(`PARTICIPANT_HAS_ACCOUNT` refuse les autres, `participant-rights-core.ts`), et un
visiteur de lien navigue sur `apps/web`. Un hôte qui lui retire
`canSendMessages` le laissait donc avec son composeur et ses gestes d'écriture
(`viewerCanWrite` ⇒ répondre, réagir) jusqu'au prochain montage du détail ou
retour de focus — puis un refus du serveur à l'envoi. Ce n'est pas une fuite :
le web n'effaçait rien parce qu'il ne lisait rien.

### Le commentaire, faux sur ses DEUX moitiés

Le site d'émission justifiait la forme réduite de sa charge en NOMMANT ses
consommateurs. Mesuré le 2026-11-21 :

| affirmation | mesure | nature de l'erreur |
|---|---|---|
| « `!== undefined` côté web » | 0 occurrence | une affirmation JAMAIS vraie |
| « Android n'a pas de consommateur » | 67 occurrences, dont `ConversationSocketEventsManager.kt`, `ParticipantRights.kt`, `ParticipantProfileViewModel.kt` | une NÉGATION devenue fausse au dégel du Kotlin (#11570) |

La leçon porte sur la seconde : **une directive qui OUVRE un chantier périme en
masse les phrases « X ne fait pas Y », et une négation est l'affirmation la moins
relue du dépôt** — elle n'a aucun consommateur à casser quand elle devient
fausse, elle se contente d'autoriser à ne pas chercher. Détail :
`tasks/lessons/2026-11-21-une-directive-qui-degele-perime-les-negations-ecrites-pendant-le-gel.md`.

### Le correctif

- **`apps/web/src/lib/api/realtime-participant-rights.ts`** — les droits servis
  **RECOUVRENT** ceux de la ligne NOMMÉE du détail, ils ne la remplacent pas. Un
  droit nommé s'applique ; un droit absent n'affirme rien. C'est la même règle
  qu'iOS (`carriesHistoryGrant`) et Android (`ParticipantProfileLive.applying`),
  et ce n'est pas une précaution de style : la charge de la ROOM retire
  `canViewHistory`, donc **une recopie inconditionnelle l'effacerait chez tout
  membre ordinaire à chaque changement d'un droit d'envoi**.
- **La table des droits est DÉRIVÉE du contrat** — un objet littéral
  `satisfies Record<keyof Required<ServedRights>, true>` : un droit ajouté à
  `ParticipantRightsUpdatedEventData.rights` et absent de la table ne compile
  pas. Une chaîne de `if` ne garde pas cette propriété.
- **L'octroi par DATE n'a aucune surface web, et ce lot n'en fabrique pas une.**
  Mesuré : `conversationDetailInclude` ne sélectionne PAS
  `Participant.historyVisibleFrom`, et rien dans `apps/web` ne le lit. Ce que le
  web porte de l'octroi est le booléen voisin, `permissions.canViewHistory` —
  c'est là que la règle de PRÉSENCE le protège, et écrire un champ que la
  passerelle ne sert jamais aurait été une donnée inventée, pas un applieur.
- **Rien sur la LISTE** : ses participants sont servis sans `permissions`
  (`conversationListParticipantSelect`), à la différence de l'appartenance du
  cycle 205, qui vit sur les deux caches.
- **Le commentaire de la passerelle est corrigé dans le MÊME lot**, contre une
  mesure DATÉE qui porte sa commande, et il nomme désormais les trois
  consommateurs qui existent.
- **Le cliquet de parité l'a attrapé dans son second sens** : l'événement
  figurait dans l'inventaire `absents: ['web']` de
  `socket-event-platform-parity-gate`, qui a rougi — « lu par cette plateforme »
  — dès que l'applieur est arrivé. Il en sort avec le commit qui le livre.

### La preuve

| mutation | témoins qui tombent |
|---|---|
| le `socket.on` retiré | **5 rouges sur 10** |
| `permissions` recopié INCONDITIONNELLEMENT depuis `rights` | **1 rouge** — « la charge réduite de la room n'efface pas voir l'historique » |
| la ligne absente FABRIQUÉE | **1 rouge** — l'identité du détail change |
| l'applieur posé, l'inventaire du cliquet de parité inchangé | **1 rouge** (`participant:rights-updated (web)`) |

| gate | résultat |
|---|---|
| `bun test src/lib/api/ src/lib/view/ src/lib/send/` (web) | **9471 verts / 0 rouge** (728 fichiers) |
| `tsc --noEmit` (web) | **0** |
| `bun run build` + `measure-weight.mjs` (web) | **vert** — chunk `realtime` 16,92 Ko gzip, sous budget |
| `vitest run __tests__/ci/` (shared) | **216 verts / 25 fichiers** |
| `tsc --noEmit` (passerelle) | **0** |
| `jest participant-rights.test.ts` (passerelle) | **54 verts** |

**Cinq des dix témoins passaient DÉJÀ** avant l'applieur, et il faut le dire :
ce sont les cas NÉGATIFS (autre conversation, charge illisible, participant
absent, connexion détruite, et le témoin d'amorce). Sans applieur, « rien ne se
passe » est exactement ce qu'ils assertent — ce sont des **pièges armés**
(patron du cycle 84), pas des preuves de rouge.

Les témoins passent par le VRAI consommateur du web (`webRepliesToMessage` via
`menuViewerOf` / `menuConversationOf`), pas par le champ : ce qui compte est que
le GESTE disparaisse — « suivre la donnée jusqu'au PIXEL » (cycle 123).

### Ce que ce lot ne fait pas, et ce qu'il a trouvé en chemin

- **Le tiroir du composeur ne restreint PAS un visiteur sans compte, et ce n'est
  pas ce lot qui l'ouvre.** `thread.tsx:187` compose `viewerParticipant` par
  `participants.find((p) => p.userId === viewer.id)` — la seule colonne `userId`.
  Pour un visiteur de lien, `viewer.id` porte un `Participant.id` (le
  `CLAUDE.md` de la passerelle le dit), donc la ligne n'est jamais trouvée et
  `Composer` reçoit `rights: undefined`, ce que son contrat lit « tout est
  autorisé ». Les gestes d'écriture du menu, eux, passent par `menuViewerOf`,
  qui résout les DEUX colonnes (`p.userId === id || p.id === id`) : c'est par là
  que ce lot atteint le produit. **La seconde moitié — les tuiles du tiroir —
  est l'issue #20264**, parce que le correctif y est une lecture d'identité et non
  un applieur temps réel, et que les mélanger ferait un lot dont la preuve ne
  dirait plus laquelle des deux règles elle garde.
- Il ne touche pas **#20093** (convergence de l'annuaire E2EE et des quatre
  lectures de la liste de membres) ni **#20189** (les droits du créateur d'un
  lien banni) : deux dossiers ouverts qui attendent une décision, pas un
  applieur.
