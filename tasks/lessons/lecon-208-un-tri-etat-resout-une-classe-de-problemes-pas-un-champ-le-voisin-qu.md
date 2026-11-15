## Leçon 208 — un tri-état résout une classe de problèmes, pas un champ : le voisin qu'on a laissé en `Optional` reste faux (2026-08-16, routine temps réel, cycle 49)

**Le fait.** Le cycle 46 bis a introduit `LastMessagePreviewTranslations`
(`.unchanged` / `.replaced([:])`) pour un motif énoncé en toutes lettres dans son
doc-comment : `Optional` confond « la clé était ABSENTE du payload » et « la clé
valait `null` », et les deux demandent des actions opposées. Le raisonnement était
juste, le correctif aussi — et il a été appliqué à **un** champ.

Deux cycles plus tard, le même payload, le champ d'à côté. `lastMessageId` est
resté `String?`, donc le client ne pouvait pas entendre « ce lecteur n'a plus
AUCUN message visible ici ». Pire que « rien ne s'applique » : le champ DÉJÀ
tri-étaté s'appliquait, lui. La carte du Prisme se vidait, l'aperçu brut restait,
et la ligne passait de **« Bonjour »** à **« Hello »** — le correctif partiel
avait transformé une ligne périmée en une ligne qui **expose l'original** du
message que le lecteur venait de masquer.

**La règle.** *Quand un tri-état est introduit pour lever une ambiguïté de
protocole, l'ambiguïté n'est pas propre au champ : elle est propre au PAYLOAD.
Le geste n'est pas terminé tant que les champs voisins qui voyagent dans le même
groupe n'ont pas été instruits — même s'ils n'ont pas encore de symptôme.*

**Le tell, disponible au moment du premier correctif.** Il ne demandait aucune
connaissance du défaut suivant, juste une lecture du payload qu'on est en train
de corriger : `messagePayloadFor(null)` était visible à l'écran, trois lignes
au-dessus du champ traité, produisant `lastMessageAt: null`, `lastMessageId:
null`, `senderId: null`. *Un émetteur qui sait produire un groupe entièrement nul
a besoin d'un tri-état par groupe, pas par champ.* Le cycle 46 bis l'a d'ailleurs
VU — sa section « piste suivante » le décrit exactement — et l'a laissé pour plus
tard. Ce n'était pas une omission, c'était un découpage ; mais le découpage a
laissé pendant deux cycles un état où le vidage partiel était **actif**, et un
vidage partiel ment plus fort qu'une absence de vidage.

**Corollaire, sur le CHOIX du champ porteur.** Un seul des quatre champs du
groupe pouvait porter le fait, et pas parce qu'il était plus pratique :
`lastMessageAt: null` décrit tout aussi bien un renommage, qui n'emporte aucune
clé `lastMessage*`. Seul `lastMessageId` a une nullité qui veut dire « aucun » et
non « inconnu » — il NOMME ce dont la ligne parle. *Quand un groupe entier doit
passer d'un état à un autre, chercher le champ qui porte l'IDENTITÉ du groupe,
pas celui qu'on lit en premier.*

**Corollaire, sur le vidage.** Le geste central (`clearLastMessage`) remet onze
champs à zéro, dont trois qui alimentent le libellé « Message expiré » / « Vue
unique ». *Un vidage partiel se lit comme un bug ; une absence de vidage se lit
au moins comme un retard.* Trois sites savaient déjà vider — deux le faisaient à
la main, incomplètement. Centraliser a été ce qui les a fait apparaître.
