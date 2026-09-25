## Leçon 520 — Le gate qu'on n'a pas pu jouer était rouge, et c'est le harnais qui l'avait rendu injouable

Même revue. Le développeur a rendu son lot en disant : « Playwright `--project=pages` lancée mais
non complétée — le sandbox est devenu saturé, chaque commande prenant plus de deux minutes ». Deux
faits, tous deux mesurés :

1. **La suite non jouée était ROUGE.** Quatre témoins de `v3-nouveau-lien.spec.ts` tombaient en
   violation de mode strict : `page.locator('button[type="submit"]')` désigne désormais DEUX boutons
   — celui de la feuille, et le « Fermer ce lien » que ce lot venait d'ajouter à chaque ligne du
   carnet derrière elle. Le développeur avait corrigé exactement ce sélecteur dans le spec voisin
   (`v3-liens-direct.spec.ts`) : il savait, et le second fichier est resté parce que le gate ne
   tournait plus. **Un gate qu'on ne peut pas jouer ne se rapporte pas « à rejouer » : il se
   rapporte ROUGE jusqu'à preuve du contraire** — et « forte confiance » n'est pas une preuve.
2. **La saturation était un DÉFAUT DU DÉPÔT, pas une fatalité de la machine.** `serveurDeLaV3`
   (`e2e/visual/lib/serveurs.ts`) faisait `spawn('npx', ['next','start'])` puis, à `ferme()`,
   `enfant.kill('SIGTERM')` : cela tue `npx` et laisse `next-server` — son petit-fils — orphelin.
   Un orphelin par fichier de spec, ~120 Mo chacun. Relevé : **122 orphelins, 14,5 Go sur 16**, le
   noyau abattant `eslint` (exit 137) et les ouvriers de jest au milieu des gates. Correctif :
   `detached: true` (le fils devient chef de GROUPE) et `process.kill(-pid)` avec un filet SIGKILL —
   mesuré, une suite entière n'ajoute plus un seul orphelin.

> **Quand l'outillage devient lent, chercher ce que l'outillage a LAISSÉ DERRIÈRE avant de conclure
> à l'environnement.** `ps -eo pid,etimes,comm` répond en une seconde à une question qu'on avait
> classée « sandbox ». Et tout `spawn` d'un serveur de test est un ARBRE : le tuer par son groupe,
> jamais par son premier processus.
