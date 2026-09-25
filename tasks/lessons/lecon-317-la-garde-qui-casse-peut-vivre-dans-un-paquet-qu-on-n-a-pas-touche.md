## Leçon 317 — La garde qui casse peut vivre dans un paquet qu'on n'a pas touché

**Contexte.** #4189 : suppression de `apps/web/components/settings/ProfileSettings.tsx`
(code mort, huit appels vers des routes inexistantes, seul importateur son propre
`.example.tsx`). Gates passés avant de pousser : gateway **912 suites / 20 580 tests**
verts, web **801 suites / 14 758 tests** verts, `tsc` sans erreur ajoutée. La CI est
tombée quand même.

**Ce qui a rougi.** `packages/shared/__tests__/password-min-length-parity.test.ts` —
une garde de parité qui **énumère explicitement onze fichiers**, dont trois vivent
dans `apps/web` et deux dans `services/gateway`. Elle les `open()` pour vérifier
qu'aucun n'impose une longueur de mot de passe concurrente. Un fichier supprimé lui
rend `ENOENT`.

**Pourquoi mes gates ne l'ont pas vue.** J'avais couvert les deux paquets que je
MODIFIAIS. La garde vit dans un troisième, que je n'avais ni ouvert ni lu — et c'est
précisément sa raison d'être : elle est là pour tenir ENSEMBLE des sites que rien
d'autre ne relie.

> **Une règle transverse est gardée depuis un endroit transverse.** Chercher les
> gardes autour de son diff revient à chercher ses clés sous le lampadaire : par
> construction, une garde de cohérence inter-paquets ne se trouve dans aucun des
> paquets qu'elle relie.

**La parade, et elle est mécanique.** Avant de SUPPRIMER ou RENOMMER un fichier,
`grep` son chemin dans **tout le dépôt**, pas seulement dans son paquet :

```bash
grep -rn "chemin/du/fichier" --include='*.ts' --include='*.tsx' . | grep -v node_modules
```

Un chemin cité en **chaîne de caractères** — dans une liste de sites, un
`readFileSync`, un manifeste, un glob de couverture — n'apparaît dans aucun graphe
d'imports. Les outils qui trouvent « qui importe ce module » sont donc structurellement
aveugles à ces références-là. C'est aussi ce qui rend ce type de garde à la fois
précieux (il tient ce que rien ne tient) et fragile (il ne participe à aucune
dépendance déclarée).

**Corollaire sur la forme des gardes.** Le doc-comment de la liste dit exactement
pourquoi elle est explicite : *« un balayage large attraperait des `.min(8)` sans
rapport ; cette liste force à classer chaque nouveau site »*. Ce choix est bon — et
son prix est que la liste est un **inventaire à tenir à jour**, au même titre que le
relais de `createMentionNotificationsBatch` de la leçon 279. Un inventaire explicite
ne se périme pas en silence : il rougit. Encore faut-il l'avoir exécuté.

**Rappel de la leçon 488** (« un changement à un host partagé doit exécuter TOUT le
répertoire de tests ») : elle disait *le répertoire*. Ce cycle l'élargit — **le
dépôt**, dès que le diff supprime ou renomme un fichier.

---
