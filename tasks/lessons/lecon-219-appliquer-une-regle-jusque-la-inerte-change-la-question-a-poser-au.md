## Leçon 219 — appliquer une règle jusque-là inerte change la question à poser au site qui l'ÉCRIT (2026-08-17, routine messagerie, cycle 56)

**Le fait.** Le cycle 31 a découvert que `isAnnouncementChannel` n'était appliqué
par personne, et l'a câblé — correctement, au point de convergence des trois
transports d'envoi. Le cycle 56 a trouvé que l'initiateur d'un tête-à-tête
pouvait poser ce drapeau sur son DM et **faire taire son pair définitivement**,
sans recours possible pour la victime.

Le code qui écrit le drapeau n'a pas changé entre les deux cycles. Ce qui a
changé, c'est qu'il est devenu **effectif**.

**La règle.** Câbler une garde jusque-là inerte, c'est transformer chaque champ
qu'elle lit en champ de SÉCURITÉ. Le même cycle doit donc reposer, sur chaque
site qui ÉCRIT ce champ, une question qui n'avait pas d'objet la veille :
*qui peut le poser, et sur quoi ?* Un champ cosmétique et un champ appliqué ne se
gardent pas pareil, et l'écrivain ne s'aperçoit de rien — sa signature, son
schéma et ses tests sont identiques de part et d'autre du câblage.

**La forme du défaut.** La garde d'écriture ne filtrait que sur le RÔLE de
l'appelant, jamais sur le TYPE du conteneur. Or `POST /conversations` crée un DM
avec deux rôles distincts — `creator` pour qui a ouvert le fil, `member` pour
l'autre — et cette asymétrie nomme un **ordre d'arrivée**, pas une hiérarchie.
Le corollaire est plus large que ce cycle : **un rôle n'est une autorité que
dans un conteneur qui a une hiérarchie.** Un tête-à-tête n'a pas
d'administrateur, et le `creator` d'un DM n'est le supérieur de personne.

**L'indice qui était déjà dans le fichier.** La règle contenait
`if (conversation.type === 'global') return 0` — donc elle connaissait la
catégorie « conteneur sans hiérarchie d'écriture ». Elle n'en connaissait qu'un
membre, et le plus exotique des deux. **Une énumération à un seul élément est un
aveu : quelque chose a été catégorisé sans que la catégorie soit balayée.** La
question à lui poser n'est pas « ce cas est-il juste ? » (il l'était) mais
« quels sont les AUTRES membres de cette catégorie ? ».

**Deux gestes, et ils ne se subsument pas.** Corriger la règle guérit les
conteneurs DÉJÀ empoisonnés en base, dont aucune route ne rendra jamais compte.
Corriger la route empêche l'écriture ET l'événement temps réel qui annoncerait
aux clients un drapeau que plus rien n'applique. Livrer l'un sans l'autre laisse
soit des victimes existantes, soit un événement qui MENT sur l'état du conteneur.

**Le symptôme repéré n'était pas le défaut.** La piste disait « `PUT
/conversations/:id` accepte de renommer un DM ». Le renommage est le champ le
plus INOFFENSIF du corps — web résout le nom du pair pour un `direct` et n'a
jamais lu `conversation.title`. On avait vu la moitié visible d'un corps de
requête dont la moitié invisible était l'attaque. **Quand une piste nomme un
champ, l'instruire c'est instruire les SEPT AUTRES du même corps** — au moins
assez pour savoir lequel est appliqué par une garde.

**La question de suivi, mécanique** (au sens de la leçon 215) : *pour chaque
réglage de CONTENEUR appliqué par une garde, quels TYPES de conteneur peuvent
légitimement le porter, et quel écrivain vérifie ce type ?* Elle se pose en
tableau, une ligne par écrivain, en partant de la garde qui APPLIQUE et en
remontant. Les préférences de communauté et les droits de lien de partage ne
l'ont jamais reçue.
