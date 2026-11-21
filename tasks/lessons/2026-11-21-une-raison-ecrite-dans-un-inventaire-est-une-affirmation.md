## Une raison écrite dans un inventaire de cliquet est une AFFIRMATION, et elle peut interdire le bon correctif

**Date** : 2026-11-21. **Lot** : #20104 (cycle 197). **Famille** : « un
doc-comment qui EXEMPTE une unité d'une règle se vérifie comme une affirmation »,
portée d'un commentaire à une entrée d'inventaire gelée.

**Le constat.** L'inventaire du cliquet des audiences classait
`routes/conversations/sharing-invite.ts#0` sous une clé dont la raison écrite
disait, en substance : *le `where` ne se resserre pas, parce que la même lecture
tient `newMemberRefusal`, un refus par égalité exacte (un tête-à-tête chiffré
reste à DEUX, #16188)*. L'issue #20104 reprenait cette phrase et en tirait son
critère de fin : « resserrer le `where` est le MAUVAIS correctif ».

Mesuré : `newMemberRefusal(conversation)` prend `{ type, encryptionMode }` et
rien d'autre. Le tête-à-tête chiffré se tient par `isEndToEndDirect`, qui **ne
compte personne**. Les deux autres consommateurs de l'objet `conversation` ne
lisent pas la liste non plus — `resolveConversationEntry` relit ses propres
lignes avec leur `bannedAt`, `isConversationClosed` ne lit que des colonnes de la
conversation. La liste avait **un** consommateur : la porte elle-même.

**Pourquoi c'est coûteux, et pas seulement inexact.** Une raison fausse dans un
inventaire ne se contente pas de mal décrire : elle **interdit**. Celle-ci
écartait le correctif à la fois le plus simple (une clause au lieu d'un prédicat)
et le plus VISIBLE au cliquet — la loi dans le `where` étant le seul endroit
qu'un balayage de source sait lire (#20050). Juger en code aurait marché et
laissé la règle invisible à l'outil censé la garder.

**Pourquoi une entrée d'inventaire trompe plus qu'un commentaire.** Un
commentaire se lit comme l'opinion de qui l'a écrit. Une entrée gelée dans un
cliquet se lit comme un VERDICT : elle a un nom de classe, une issue de suivi,
elle est tenue par un test vert, et le dépôt distingue même
`DELIBERATELY_WIDE` (« décidé large ») de `MEASURED_NOT_INSTRUCTED` (« pas encore
instruit ») pour éviter de confondre une dette et une autorisation. Cette
distinction est juste — et elle ne protège pas de la troisième possibilité :
**instruite, écrite, et fausse.**

> Devant une entrée d'inventaire qui interdit un correctif, la question n'est pas
> « que dit la raison ? » mais **« qui, aujourd'hui, consomme la lecture qu'elle
> protège ? »** — et elle se répond en ouvrant chaque consommateur, pas en
> relisant la phrase.

**La forme outillée de la question.** Compter les consommateurs : `grep -c` sur
l'expression qui lit la liste (`conversation.participants`), puis ouvrir chacun
et lire ce qu'il prend EN PARAMÈTRE. Un consommateur qui reçoit l'objet entier ne
lit pas forcément tout l'objet, et c'est exactement l'écart par lequel cette
raison est devenue fausse : `newMemberRefusal(conversation)` *a l'air* de
dépendre de la liste, puisqu'on lui passe l'objet qui la porte.

**Corollaire de nettoyage.** Quand la mesure retire un site de l'inventaire, son
entrée ET sa raison partent. Garder la raison « pour l'histoire » laisserait
lisible une interdiction mesurée fausse ; garder l'entrée orpheline autoriserait
en silence un site futur qui reprendrait sa clé.

**Corollaire de mesure.** Le balayage RECONNAÎT `{ ...PARTICIPATION_VIVANTE, … }`
(`usesLaw: true`, vérifié par une sonde jetable avant de conclure) : la crainte
du cycle 194 — « un refactor qui sort un discriminant du littéral casse le
cliquet qui le lit » — ne vaut pas de cette forme-ci. Une crainte héritée se
mesure comme une raison héritée.
