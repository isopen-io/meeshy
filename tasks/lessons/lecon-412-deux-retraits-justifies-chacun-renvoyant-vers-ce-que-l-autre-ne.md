## Leçon 412 — Deux retraits justifiés, chacun renvoyant vers ce que l'autre ne fournit pas, ferment un chemin sans qu'aucun site ne rougisse

**Le lot** (#4722). Sur la surface scène du composer, il n'existait plus AUCUN
chemin pour ajouter un son. Deux commits l'avaient fermé, à un jour d'écart,
chacun parfaitement défendable :

| ce qui est parti | quand | vers quoi son auteur renvoyait |
|---|---|---|
| la porte `sound` du rail | 2026-08-31 | « le son POSÉ revient par la palette de constructions (#4579), le son de FOND reste au socle » |
| la pastille « Ajouter un son » du socle | 2026-09-01 | la pastille de l'avatar — qui affiche un **crédit**, donc ne se peint que s'il y a DÉJÀ un son |

La palette n'a jamais reçu son onglet son (#4579 est ouvert : cinq onglets,
aucun audio). Le premier retrait renvoyait vers une chose qui n'existait pas
encore ; le second a emporté la seule qui existait.

> **Une somme n'a pas de site où rougir.** Chaque commit est juste, chaque
> témoin est vert, chaque doc-comment dit la vérité de son jour. Le défaut ne
> vit dans aucun des deux fichiers — il vit dans leur intersection, qui n'est
> écrite nulle part.

**Ce qui aurait pu l'attraper, et qui a échoué.** Un témoin gardait précisément
ce retrait : `test_laPorteSon_nEstPlusServie`. Sa raison était écrite dans son
message d'échec — « le son de fond vit au socle, le son POSÉ viendra de la
palette ». Deux faits EXTÉRIEURS à son champ de vision, qu'il n'interrogeait
pas. Les deux ont disparu après lui. Il est resté vert.

> **Un témoin qui épingle une ABSENCE s'appuie presque toujours sur ce qui
> existe AILLEURS — et cet ailleurs n'est pas dans ses assertions.** Il se
> périme alors en silence, ce qu'une garde positive ne fait pas : celle-ci
> tombe dès que ce qu'elle exige disparaît.

**Le témoin de remplacement ne demande pas une absence, il demande une
DISPONIBILITÉ**, et sur l'ensemble que le mot de la directive quantifie
(« TOUJOURS » ⇒ les trois formats à scène, et aucun `status`). Il ne peut pas
être satisfait par un jeu vide, et il tombe quel que soit le retrait qui ferme
le dernier chemin.

**Le corollaire trouvé en aval, et qui valait le lot à lui seul.** Une fois la
porte rendue, elle ouvrait une feuille dont le choix « premier plan » ne
produisait rien de visible. Le mot désignait DEUX choses :
`ComposerAudioRole.foreground` dit au SDK « un objet posé sur la scène », le
meuble le lisait « une carte de contenu sous le texte ». Trois chemins
d'ingestion, trois réponses — l'enregistrement posait une carte, le fichier
importé un objet de scène, l'emprunt laissait la règle automatique trancher. Et
sur la surface de l'autre, chacun devenait INVISIBLE sans disparaître : la carte
n'est rendue que par la branche sans scène, l'objet que s'il y a une toile. Le
son partait à la publication sans qu'aucun écran ne le montre.

> **Ce qui décide n'est ni le geste ni le chemin d'ingestion, c'est la SURFACE**
> — elle seule dit s'il existe une toile où poser une puce, ou une colonne de
> texte sous laquelle glisser une carte. Un mot qui désigne deux choses selon le
> contexte a besoin d'un type qui le dise ; sinon chaque site tranche, et aucun
> ne se sait en désaccord.

**Et un libellé qui décrit ce que l'option fait AILLEURS est pire qu'un libellé
vague** : il est vérifiable, et il est faux. « Contenu de publication · Pièce
jointe du post, avec son lecteur » est juste sur un post texte et ment sur une
scène, où le même choix pose une puce. L'auteur qui le lit choisit sciemment
autre chose que ce qu'il obtient. La règle de libellé reçoit donc la destination
— et les DEUX chaînes du bouton, celle de l'œil et celle de VoiceOver, la
reçoivent ensemble : celle qu'on n'entend pas est celle que personne ne corrige.
