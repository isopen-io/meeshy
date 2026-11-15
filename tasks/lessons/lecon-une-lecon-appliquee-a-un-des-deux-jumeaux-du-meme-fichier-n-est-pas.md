## Leçon — une leçon appliquée à UN des deux jumeaux du même fichier n'est pas apprise (#6820)

`decode.ts` (`apps/web-v2`) porte DEUX décodeurs : `decodeMessage` et
`decodeAttachment`, vingt lignes d'écart. #6080 a converti le PREMIER d'une
énumération en un invariant, a posé l'outil générique (`sansNull`), a écrit la
raison dans le code — « une énumération tenue à la main est un inventaire qui
retient en silence chaque champ ajouté en amont » — et a laissé le SECOND
énumérer cinq clés là où la passerelle en sert vingt et une.

Le prix : `imageVariants: null` atteignait `attachmentSrcSet`, dont la garde ne
connaît que `undefined`. « Cannot read properties of null (reading 'length') »,
le fil ENTIER par terre dès qu'une image n'a pas de variantes WebP — donc toute
image chiffrée, et toute pièce envoyée avant D4.

Ce qui rend le motif coûteux, c'est que l'énumération ne se lit pas comme une
dette : chacune de ses lignes est juste, et la liste s'allonge d'une clé par
incident (#5805 en a ajouté quatre, #6221 une, celle-ci une sixième). Un
correctif qui allonge la liste RESSEMBLE à un correctif, et laisse le défaut
intact pour le champ suivant.

> **Un correctif de CLASSE doit énumérer ses SITES avant de se déclarer fini.**
> La question n'est pas « ai-je corrigé le site qui a levé ? » mais **« où
> ailleurs cette même forme est-elle écrite ? »** — et le premier endroit à
> regarder est le FICHIER qu'on vient de modifier : un jumeau à vingt lignes
> échappe à la revue précisément parce qu'on croit avoir lu le fichier.

Corollaire de témoin, vérifié ici : le témoin écrit pour la face que je croyais
cassée (`thumbHash` → aplat de couleur arbitraire via `atob(null)`) est passé
AVANT le correctif — `thumbHash` était l'une des cinq clés déjà défaites.
**Un témoin qui passe au rouge-attendu est une mesure, pas une formalité** :
c'est lui qui a corrigé mon analyse, et la face réellement silencieuse était
l'autre (`width`/`height` → `aspect-ratio: "null / null"`, dont le témoin, lui,
a rougi). Écrire le témoin de CHAQUE face supposée, puis lire lesquels rougissent,
sépare le défaut mesuré du défaut raconté.

Second corollaire, trouvé en appliquant cette leçon à elle-même : le TROISIÈME
décodeur du fichier (`decodeConversation`) énumère lui aussi — une seule clé
sur trente-huit champs optionnels. Mais **il ne se corrige PAS de la même
ligne**, et c'est le point à retenir : ce qui rend `sansNull` sûr sur
`Attachment` n'est pas une généralité, c'est un fait de TYPE — aucun de ses
champs ne distingue « absent » de « null ». `Conversation` déclare au moins
`currentUserRole?: string | null` où le type dit « `null` = le lecteur n'est
pas membre ». Y passer `sansNull` effacerait cette distinction, et
SILENCIEUSEMENT : son unique lecteur actuel fait `?? ''` et ne verrait rien.

> **Reconnaître une forme n'autorise pas à rejouer le correctif.** Le correctif
> d'une classe se justifie site par site, par l'argument qui le rend sûr
> — ici : « tout champ optionnel dont `null` et `undefined` disent la même
> chose ». Là où l'argument tombe, la ressemblance devient un piège, et le lot
> honnête est une ISSUE (#6826), pas une ligne de plus.
