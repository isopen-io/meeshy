## Une décision écrite sur une CHAÎNE ne gouverne pas ce qui voyage à côté d'elle

*2026-11-20 — #20018, suite de #19978.*

`servedQuotedMessage.ts` porte, dans son en-tête, une décision explicite et
JUSTE :

> « L'ÉPHÉMÈRE n'est pas une protection au sens de la citation — son texte est
> lisible dans le fil jusqu'à l'expiration, et la citation vit dans ce même
> fil. Même lecture exactement que `APIMessageReplyTo.isProtected` côté iOS :
> sans cette symétrie, la passerelle masquerait un texte que le client affiche,
> ou l'inverse. »

Elle explique pourquoi `quotedMessageIsProtected` ne lit pas `expiresAt`. Elle
est argumentée, sourcée, et symétrique d'un client nommé. **Et c'est elle qui a
tenu ouverte la fuite que #19978 venait de fermer un événement plus tôt.**

Parce qu'elle parle du TEXTE CITÉ. La transcription d'un vocal cité, sa
description, ses pistes traduites ne sont pas son texte : ce sont ses contenus
LATÉRAUX, et la loi qui les gouverne (`mediaSideContentMayTravel`) ferme sur
l'échéance POSÉE. Les deux lois se contredisaient donc sur le même message, à
une seconde d'intervalle :

| événement | ce qui part |
|---|---|
| `message:new` du vocal éphémère | `transcription: null` ✅ |
| `message:new` de la réponse qui le CITE | la transcription ENTIÈRE ❌ |

### Pourquoi la décision ne pouvait pas voir le défaut

Les deux objets ne se valent pas, et la décision n'avait aucune raison de le
dire — personne ne le lui avait demandé :

- le **texte cité** meurt avec le fil quand l'éphémère expire ;
- la **transcription** est une COPIE DURABLE qui lui survit.

Le premier critère de fin de l'issue (« que `quotedMessageIsProtected` lise
`expiresAt` ») aurait donc CASSÉ la décision pour réparer le défaut, en
masquant la citation entière. Le correctif juste garde le texte et passe les
pièces par la loi du porteur : une décision sur une chaîne et une loi sur un
médium cohabitent, elles ne s'arbitrent pas.

> **Devant une décision écrite qui semble autoriser ce qu'on croit être une
> fuite : ne pas la renverser, et ne pas s'y arrêter non plus. Demander DE QUOI
> elle parle.** Une décision sur un champ ne se prononce pas sur ses voisins —
> c'est la leçon 275 (« une protection se mesure sur tout ce que la charge
> TRANSPORTE ») appliquée non plus à du code, mais à un ARGUMENT.

### Corollaire : une dette peut n'exister que sur un CHEMIN

`servedSideContent` laisse les mots des pistes traduites, et la raison est
mesurée : le contrat partagé déclare `transcription` REQUISE, `fast-json-stringify`
lève sur une requise absente, et retirer la clé rendait la liste REST et `/sync`
en 500 (#20015).

Sur le chemin de la CITATION, ce blocage **n'existe pas** :
`messageSchema.replyTo.attachments.items` déclare douze champs et ni
`transcription` ni `translations`. REST les supprime déjà ; le seul canal qui
les transportait est le socket, qui n'a aucun sérialiseur. La citation peut donc
retirer ce que le porteur ne peut pas encore retirer.

**Une dette héritée ne se recopie pas d'un site à l'autre sans vérifier que sa
CAUSE y est présente.** Appliquer ici la retenue de #20015 par cohérence aurait
laissé la fuite ouverte au nom d'une contrainte qui ne s'exerce pas sur ce
chemin — et l'aurait fait en citant une mesure exacte, ce qui est la forme la
plus crédible d'une erreur.
