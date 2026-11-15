## Les trois questions d'une extraction Swift

Elles se posent AVANT de couper, et aucune ne se déduit des autres :

1. **quels TYPES le bloc nomme-t-il** — chaque majuscule confrontée au framework
   qui la fournit, jamais une liste d'imports recopiée du fichier d'origine ;
2. **quels MEMBRES touche-t-il** — un `private` du fichier hôte devient
   inaccessible dès la première ligne d'un fichier frère (`CLAUDE.md` iOS,
   § « Piège accès cross-file ») ;
3. **où vivent ses APPELANTS** — dans un fichier à plusieurs types, « le »
   helper n'existe pas ; il y en a un par classe.
