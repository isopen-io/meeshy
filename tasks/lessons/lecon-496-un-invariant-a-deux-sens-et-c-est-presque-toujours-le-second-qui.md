## Leçon 496 — Un invariant a deux sens, et c'est presque toujours le second qui manque

`check-v3-pipeline.mjs` gardait « la règle du routeur ne réclame que des
chemins que la zone SERT ». Impeccable, testé, prouvé rouge sous mutation — et
aveugle à l'exact contraire : **la zone pouvait servir un écran que la règle ne
réclame pas**, et rien ne rougissait.

Mesuré le 2026-09-03 : `/stories/:id`, `/post/:id`, `/search`, `/links`,
`/contacts` et `/notifications` étaient tous servis par `apps/web-v3/app` et
sur AUCUN chemin de bascule. Six écrans livrés, testés, mesurés — et
injoignables depuis un navigateur. Le porteur en a conclu que le travail
n'était pas fait, ce qui était la seule conclusion que la preuve à sa
disposition autorisait.

**Une garde qui vérifie « tout ce que A déclare existe dans B » ne dit RIEN de
« tout ce que B contient est déclaré dans A ».** Les deux sens ont l'air d'une
seule idée quand on l'écrit en français — « A et B sont d'accord » — et ce
sont deux contrôles. Le premier attrape la déclaration de trop, le second
l'oubli ; et l'oubli est le défaut nominal, parce qu'il est ce qu'on produit
en ajoutant quelque chose sans penser à tout ce qui devrait suivre.

La question à poser à tout invariant de correspondance est donc : **« et si
j'ajoute une ligne DE L'AUTRE CÔTÉ, qui rougit ? »**
