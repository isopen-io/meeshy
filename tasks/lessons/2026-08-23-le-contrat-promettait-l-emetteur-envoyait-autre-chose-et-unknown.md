## 2026-08-23 — Le contrat promettait, l'émetteur envoyait autre chose, et `unknown` tenait la porte (109)

### 1. Un suivi hérité se MESURE avant d'être recopié — et celui-ci coûtait 3 cycles

« La bivariance reste la limite, elle dépasse Socket.IO, décision à instruire »
a voyagé de journal en journal du cycle 107 bis au 108 ter **sans que personne
ne lance la commande**. Elle tient en une ligne : `strictFunctionTypes: true`
sur la passerelle ⇒ 52 erreurs, dont **9 dans le cœur temps réel**, et ces
neuf-là nommaient un défaut de production vieux de quatre incidents.

C'est la leçon 107 (« un suivi hérité est une AFFIRMATION ») rejouée à
l'identique, un cran plus cher : là-bas le suivi était FAUX, ici il était
VRAI — et différer sa mesure a différé la découverte, pas seulement la
correction.

- **Un suivi qui dit « c'est une grande décision » mérite d'abord une MESURE,
  pas un arbitrage.** Le chiffre décide s'il y a un lot ; l'intuition, non.
- **Un gros total peut cacher un petit lot mûr.** 52 erreurs se lisent comme
  « intouchable » ; leur DISTRIBUTION disait 43 Fastify (un autre sujet) + 9
  réactions (mon domaine, et un bug réel).

### 2. `unknown` sur un rappel n'est pas une commodité, c'est l'absence du contrat

Le contrat promettait `ReactionUpdateEventData` ; le handler prenait
`SocketIOResponse<unknown>` et envoyait une ligne brute, ou
`{ message: 'Reaction already absent' }`. **Aucune des deux moitiés du fil ne
vérifiait l'autre.**

Même famille exacte que `Record<string, unknown>` sur `emitWithSeq` (cycle 105)
et que le cast sur un objet de contrat (cycles 103/104) : la forme opaque n'est
jamais un choix de typage, c'est **la MARQUE de la gouvernance qui manque**.

- **Le geste qui ferme n'est pas de retyper à la main, c'est de DÉRIVER.**
  `AckOf<'reaction:add'> = NonNullable<Parameters<ClientToServerEvents['reaction:add']>[1]>`
  n'est pas une copie du contrat, c'est une lecture : il n'existe plus qu'une
  déclaration, donc plus rien à faire diverger.
- **Et il faut typer les LOCALES aussi.** `const successResponse:
  SocketIOResponse<unknown> = {…}; callback(successResponse)` rouvre au ligne
  suivante la porte que la signature vient de fermer. D'où `AckResponseOf<E>`.

### 3. Le compilateur trouve ce que quatre relectures ont manqué

À la première compilation sous la porte typée, `TS2353` a nommé **deux sites que
je n'avais pas vus** : le chemin idempotent des familles COMMENTAIRE et POST
portait encore la phrase anglaise, alors que leur chemin nominal était réparé
depuis longtemps — recopiée du site message, avec le commentaire qui l'avoue
(« Mirrors ReactionHandler.handleReactionRemove »).

Et c'est le chemin du **double-tap**, celui qu'un accusé idempotent existe pour
absorber : le plus fréquent des trois.

- **« J'ai lu le code » n'est pas une mesure.** Le prouver en posant la garde
  et en regardant ce qu'elle refuse en est une.
- **Une réparation à MOITIÉ est le pire état d'une famille** : le chemin nominal
  vert donne le dossier pour clos, et le chemin résiduel n'a plus personne pour
  le chercher.

### 4. Ne pas aligner une famille sur sa jumelle sans lire ce que chacune GARANTIT

La tentation évidente était de copier « ACK == broadcast » (comment/post) sur la
famille message. **C'eût été une régression** : la famille message acquitte dès
la PERSISTANCE, délibérément, pour qu'un accroc de lecture post-succès ne
retourne jamais l'accusé en échec (ce qui ferait annuler au client une réaction
déjà en base). Porter l'agrégation exige d'acquitter APRÈS elle.

- **La consistance juste n'est pas « toutes envoient la même chose », c'est
  « chacune déclare ce qu'elle envoie ».** Trois émetteurs aux garanties
  différentes doivent avoir trois déclarations différentes ; les forcer à une
  seule casse celui qui avait raison.
- **Devant deux jumelles qui divergent, la question n'est pas « laquelle
  copier ? » mais « qu'est-ce que chacune garantit que l'autre ne garantit
  pas ? ».**

### 5. Un balayage se discrimine sur le TYPE, jamais sur le NOM

Mon `grep` de recensement cherchait `callback?: (response: SocketIOResponse` et a
rendu 11 sites. Le balayage écrit ensuite, discriminant sur la RÉDACTION du
type, en a trouvé un douzième : `AttachmentReactionHandler` nomme son paramètre
`r`.

Règle du cycle 107 (« un balayage qui cherche UN idiome mesure sa popularité »)
retrouvée par l'autre bout — et elle a payé dans la même heure.

### 6. Geler un inventaire est une DÉCISION, et elle se motive par une mesure

Les 11 portes restantes ont été **ouvertes une par une** : aucune ne ment
(`MessageHandler` déclare `SocketIOResponse<{ messageId }>` là où le contrat
déclare `MessageSendResponseData`, qui EST `{ messageId }`). Jumeaux
structurels ⇒ risque de DÉRIVE, pas divergence.

- **Distinguer « ment » de « redit »** décide de l'urgence : les premières se
  ferment dans le lot qui les trouve, les secondes se drainent ensuite.
- **Et surtout pas dans le même lot** : 4 des 11 sont sur le chemin d'envoi de
  message, le plus fréquenté du produit. Un lot de consistance n'y entre pas
  sans ses propres témoins.
