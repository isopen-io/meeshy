## Leçon 236 — « ça dépasse le périmètre » est parfois le défaut lui-même (2026-08-18, routine messagerie, cycle 69)

> Numérotation : le carnet porte DEUX « Leçon 234 » (cycles 66 et 67) et la 235
> est prise par le cycle 68 (PR #3204, concurrente). 236 est le premier numéro
> libre — vérifié, pas supposé.

Le cycle 67 a nommé une piste, l'a documentée avec précision, et l'a classée
non-livrable sur une excuse :

> Corriger demande de savoir ce que le client doit croire après un 500, ce qui
> **dépasse le périmètre** d'un correctif de clôture.

L'excuse était fausse, et sa fausseté était visible dans son énoncé même. La
question « que doit croire le client après un 500 ? » **n'existe que parce que
les deux écritures peuvent atterrir séparément.** Elle n'appelait pas une
réponse : elle appelait la suppression de sa propre condition d'existence. Une
transaction, et un 500 redevient ce qu'il prétend être.

> Quand une piste est reportée parce qu'elle « exige de trancher X », demander
> d'abord **si X est une question ou un symptôme**. Une question qui n'apparaît
> que dans un mode d'échec n'a pas à être tranchée — elle a à être supprimée avec
> le mode d'échec. Reporter revient alors à conserver le défaut pour préserver la
> question qu'il pose.

### Le corollaire qui coûte le plus cher

Une note de report est écrite par quelqu'un qui vient de comprendre le dossier —
donc au moment de **compétence maximale** sur ce code. Elle est relue par
quelqu'un qui n'a que la note. Elle est donc crue.

> Une piste reportée avec une raison est plus durable qu'une piste reportée sans
> raison : la raison la fait passer pour instruite. **Relire les reports du cycle
> précédent en attaquant leur JUSTIFICATION, pas leur sujet.**

### Et la variante « le fichier énonce la règle qu'il viole »

`delete-for-me.ts` portait, vingt lignes au-dessus de son émission fautive, la
règle exacte que cette émission enfreignait — appliquée aux deux branches de
clôture, absente de la troisième. Même forme que la Leçon 235, rencontrée le même
jour sur un autre fichier par une autre passe : **un commentaire porte le
périmètre du cycle qui l'écrit, jamais celui du fichier qui le reçoit.**

> Devant un commentaire qui énonce une règle générale, ne pas le lire comme un
> constat — le lire comme une REQUÊTE, et l'exécuter sur tout le fichier.

---
