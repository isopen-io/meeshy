## Une valeur « neutre » servie faute de mieux n'est pas neutre : `[]` écrit « il n'y en a pas », et une clé à `undefined` écrase autant qu'une valeur

**Le défaut.** `serializeAttachmentForSocket` servait `currentUserReactions: []`
quand aucun lecteur n'était nommé — en diffusion, par construction. Son
doc-comment l'annonçait sans y voir un défaut : « `currentParticipantId` absent
(broadcast) → `currentUserReactions` vide ». Le client fusionne la charge
(`{ ...cached, ...incoming }`) : `[]` écrasait les réactions que le lecteur
avait posées sur sa propre pièce, à chaque enrichissement du vocal.

**La distinction que `[]` ne peut pas porter.** Un champ a trois états, pas deux :
*il vaut ceci* · *il ne vaut rien* · **je n'ai pas la question**. Une valeur
neutre fond les deux derniers, et c'est le consommateur qui paie la fusion —
il ne peut plus distinguer une réponse d'une abstention. **La clé ABSENTE est la
seule forme qui dise « cet événement ne parle pas de ça »**, et la seule qui
survive à un `spread`.

**Le corollaire qui attrape la moitié du défaut.** `undefined` ne sauve rien :
`{ ...cached, ...{ k: undefined } }` écrase `cached.k`. Un témoin écrit
`expect(x.k).toBeUndefined()` passe donc sur la forme CASSÉE. **Ce qui se mesure
est la présence de la clé** — `expect('k' in x).toBe(false)` — et la mutation
« la clé part à `undefined` » doit tomber exactement comme « la clé repart
toujours ». Mesuré sur ce lot : 8 témoins chacune.

**Où chercher le défaut.** Pas chez l'émetteur nommé dans le rapport : chez la
fonction qui FABRIQUE la valeur neutre. Ici l'issue était rédigée depuis
`emitAttachmentUpdated` ; le même appel nu existait dans `MessageHandler` pour
`message:edited`, sur un message EXISTANT dont la pièce porte bel et bien des
réactions. Corriger l'émetteur cité aurait laissé le second site, et le second
site était invisible parce que personne ne l'avait regardé sous cet angle.

**La question à poser.** Devant un champ servi par défaut : *qui, en aval,
distingue cette valeur d'une vraie réponse ?* Si personne ne le peut, la valeur
par défaut n'est pas prudente — elle AFFIRME. Et la bonne réponse est rarement
une autre valeur : c'est de ne rien dire.

**Corollaire de relevé.** Avant de changer la forme d'une charge, relever ce que
CHAQUE client en fait. Ici deux clients sur trois protégeaient déjà ce champ
d'une diffusion ou l'ignoraient — ils avaient déjà tranché la question du
contrat, et le relevé a transformé une « décision de contrat à prendre » en
constat. Le troisième ne se défendait pas, et c'était lui le symptôme.
