## Un contrat OPTIONNEL ne se mesure pas, il se contente (cycle 141)

**Issues** : #16687, #16720 · **Trouvé par** : `auditeur-adversarial`

Le lot #16687 avait besoin que la file hors ligne puisse demander à
`connectedUsers` non plus « cette clé a-t-elle une socket ? » (`has`) mais
« cette socket est-elle joignable pour CETTE conversation ? » (`get`, puis le
marqueur). J'ai déclaré `get` **optionnel**, « par décision, fail-OPEN », en
justifiant la tolérance par les DOUBLES DE TEST : une carte réduite à `has`
garderait le comportement d'avant le lot.

Mesuré : ce n'était pas un double. `MeeshySocketIOHandler` passait
`new Set(manager.getConnectedUsers())` — un `Set<string>`, qui répond `has` et
n'a pas `get` — sur les **quatre** chemins de `message:attachment-updated`. La
porte y était morte en silence : un vocal dont Whisper finit la transcription
partait sur une room que le destinataire n'avait pas pu rejoindre, et rien
n'était enfilé. Le défaut même que le lot nomme, sur le transport que le lot ne
couvrait pas.

> **« Optionnel » dans un contrat de dépendance ne veut pas dire « tolérant » :
> il veut dire « muet ».** L'arbitrage fail-open a sa place sur une ENTRÉE de
> file — une donnée qu'on peut lire, refuser, journaliser — et aucune sur la
> FORME d'un collaborateur, où il ne fait que supprimer le signal. Requis, le
> compilateur a nommé les quatre sites en une compilation ; optionnel, il n'y
> avait rien à trouver.

La question à poser avant de rendre un membre de contrat optionnel :
**« la forme que je viens de déclarer acceptable, qui la passe en
PRODUCTION ? »** — `grep` sur les sites d'appel, pas une intuition sur ce qu'un
double ferait. Je l'avais supposée, pas posée.

### Et le témoin que j'avais écrit CERTIFIAIT le trou

Le lot ajoutait « un connectedUsers sans `get` reste accepté — l'absence de
marqueur vaut joignable », avec un doc-comment présentant la forme réduite comme
un double plausible. Vert, et il l'aurait resté. C'est mot pour mot la forme que
le `CLAUDE.md` du gateway décrit déjà : « poser une surface de double pour
empêcher une route de tomber, c'est supprimer le seul signal qui la ferait
réparer ».

> **Un témoin qui ÉTEND la tolérance d'un contrat est une AFFIRMATION sur la
> production**, au même titre qu'un compte ou un tri. Il dit « cette forme
> existe et elle est acceptable » — deux choses, dont la seconde se décide et la
> première se VÉRIFIE.

### Corollaire — deux redéclarations étroites marquaient l'endroit

Les deux seuls sites du dépôt qui REDÉCLARAIENT la forme au lieu de DÉRIVER le
type partagé (`emitAttachmentUpdated.ts`, `ready-listener.ts`) étaient
exactement les deux où la garde était morte. Une redéclaration étroite n'est pas
un détail de style : c'est l'endroit où un contrat cesse d'être partagé, donc
l'endroit où il cesse d'être tenu. Chercher `{ has(key: string): boolean }` à la
main là où un `Deps['x']` existe.

### Corollaire — un invariant qu'on vient d'écrire se vérifie comme un hérité

L'audit a aussi montré que mon doc-comment tout neuf affirmait, au présent et en
tête du champ, une couverture que la garde n'avait pas (la lecture Prisma qui
lève laisse la socket sans room ET sans marqueur ; le marqueur est perdu au
départ de l'appareil sain). Le dépôt sait déjà qu'« un commentaire qui ÉNONCE
une contrainte est une AFFIRMATION » — la variante coûteuse est de l'appliquer
aux commentaires des AUTRES et pas au sien, écrit dans l'élan du correctif, au
moment où l'on est le plus convaincu.
