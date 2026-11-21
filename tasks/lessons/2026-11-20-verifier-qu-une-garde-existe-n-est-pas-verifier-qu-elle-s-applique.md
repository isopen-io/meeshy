## Vérifier qu'une garde EXISTE n'est pas vérifier qu'elle s'APPLIQUE à mon cas (cycle 195, #20100)

Le lot #20100 resserre l'audience de l'éventail de notifications push, et doit
prouver que resserrer **n'ouvre rien** : la même lecture alimente une liste de
REFUS, que le sur-ensemble sert normalement mieux. J'ai ouvert la garde d'amont
(`MentionService.validateMentionPermissions`), lu sa lecture de conversation —
`where: PARTICIPATION_VIVANTE`, posé par #14066 — et écrit la conclusion sur le
site, dans le journal, dans la décision et dans l'inventaire : « borné en amont,
mesuré ».

La fonction a **trois régimes**. Elle épelle la loi en portées `interlocutor` et
`members`. En portée **`directory`** — conversation `public`, `global`,
`broadcast` — elle valide « tout compte existant », sans aucun filtre
d'appartenance, et le dit sur place dans un commentaire. Je n'avais pas lu ses
branches.

> **La question n'est pas « cette fonction épelle-t-elle la loi ? » mais « sous
> quelle PORTÉE s'applique ce qu'elle épelle, et la mienne y est-elle ? »** Une
> fonction d'autorisation est presque toujours un `switch` : trouver la bonne
> clause dans l'une de ses branches prouve l'existence d'une garde, jamais sa
> couverture.

Sur le chemin d'envoi, la conclusion tenait quand même — par une **autre garde**
(le `memberIds` que le lot venait de resserrer, dont le filtre interne est la
porte d'admission du batch de mentions). Le correctif était juste, sa raison
désignait ce qui ne porte pas.

> **Une raison qui nomme la mauvaise garde est pire qu'une absence de raison** :
> elle autorise le prochain lot à retirer celle qui porte, en toute confiance.

### Et la même phrase, sur la jumelle, était une FUITE — écrite comme une décision instruite

Le chemin d'ÉDITION (`notifyNewlyMentioned`) portait la même affirmation dans
`DELIBERATELY_WIDE` : « ne tire de cette liste que des EXCLUSIONS […] **Mesuré,
pas supposé** ». La lecture composait aussi le `memberIds` d'ADMISSION, sous
`isActive` nu : une édition qui ajoute `@banni` dans une conversation `public`
lui poussait le **texte édité** sur sa room personnelle, la seule qui lui reste.

J'avais vu ce site, et noté en le lisant « passé en dernier argument au batch —
reste à voir pour quoi ». Je ne l'ai pas fait : j'ai conclu depuis les deux
helpers d'exclusion que je comprenais déjà.

> **Une question qu'on se pose et qu'on ne referme pas devient une affirmation
> dans le texte qu'on écrit ensuite** — et celle-ci est ressortie à l'endroit le
> plus autorisé du dépôt, l'inventaire réservé aux décisions INSTRUITES, sous les
> mots « Mesuré, pas supposé ». Un lot qui écrit ses raisons doit relire celles
> dont il n'a pas fermé la question, parce que la forme écrite les promeut.

Corollaire de remède, et il vient du dépôt : l'admission se juge **localement**
(`liveMembers.has(userId)`), pas en déléguant au filtre de l'appelé. « Une garde
de confidentialité qui dépend du câblage de l'appelant échoue en montrant PLUS »
était écrit deux paragraphes au-dessus, dans la même unité.
