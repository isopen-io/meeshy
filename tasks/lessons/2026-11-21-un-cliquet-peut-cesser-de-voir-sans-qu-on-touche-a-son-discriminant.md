## Un cliquet peut cesser de VOIR sans qu'on touche à son discriminant

**2026-11-21, cycle 197 bis (#20143, sur le chemin de #20129).** Trouvé sur
moi-même, en relisant un vert.

### Ce qui s'est passé

Le cycle 196 a gelé les sites qui posent ou apparient
`MessageAttachment.uploadedBy`, par un balayage dont le discriminant est
`/\buploadedBy\s*\??\s*:\s*/`. Le cycle 197 a corrigé deux de ces sites et
refactorisé l'un d'eux : le filtre Prisma est passé dans une variable, remise à
une fonction de fournée, et le `where` s'est écrit en **forme abrégée** :

```ts
where: { uploadedBy, isAnonymous: false, … }   // ← le discriminant exige « uploadedBy : »
```

Le cliquet est resté **VERT**, et son témoin « déclare autant d'usages que le
fichier en porte » aussi. Ce qu'il comptait à la place était l'annotation de
TYPE du paramètre de la nouvelle fonction (`uploadedBy: { in: string[] }`), que
son écarteur de schémas JSON ne reconnaît pas comme un schéma. **Un compte juste
pour une raison fausse** : le site réel était devenu invisible, et un site
inexistant le remplaçait dans l'inventaire.

Personne n'avait touché au balayage. Le code avait changé de FORME.

### La règle

> La question à poser après tout refactor d'un site GELÉ n'est pas « le cliquet
> passe-t-il ? » mais **« voit-il encore ce qu'il prétend voir ? »**. Elle se
> répond en IMPRIMANT ce que le balayage relève, jamais en lisant son verdict.

C'est le pendant, côté refactor, de « un cliquet qui rassure à tort est pire que
pas de cliquet » (#20113, F2-F4) : là, le discriminant était trop étroit dès
l'écriture ; ici, il était juste, et c'est le dépôt qui s'est déplacé hors de son
champ. Les deux rendent le même vert, et seul le second ne laisse aucune trace
dans l'historique du cliquet.

### Les deux corollaires qui ont changé le code

1. **Un site gelé se laisse LIRE à l'endroit où il décide.** La structure a été
   reprise pour que le `where` soit composé là où il est posé
   (`uploadedBy: uploadedByOfAccount(userId, participantIds)`) plutôt que hissé
   dans un paramètre. Ce n'est pas une concession à l'outil : un `where` qui se
   lit à son site de pose est aussi ce qu'un relecteur peut juger.
2. **Une étiquette déclarée à la main se double d'un témoin qui la MESURE.** Le
   verdict `account-and-legacy` affirme que le site apparie les deux espaces ; le
   balayage ne lit qu'une valeur, pas une sémantique. Un témoin vérifie donc que
   les deux sites passent par le site unique de la loi — et il tombe sur une
   recopie inline de cette loi, qui aurait été indistinguable au verdict.

### Le signal faible à retenir

Le soupçon est venu d'une coïncidence suspecte : le cliquet passait **du premier
coup** après un refactor qui déplaçait la forme exacte qu'il balaie. Un gel qui
ne bronche pas quand on remue ce qu'il tient mérite qu'on lui demande ce qu'il a
compté.
