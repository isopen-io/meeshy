## 2026-10-27 — Un verrou posé par un script TUÉ reste posé, et bloque toutes les sessions (#13137)

Un script de build prenait `.git/ios-build.lock` par `mkdir` puis posait
`trap 'rmdir …' EXIT`. Passé en arrière-plan après le délai de l'outil, il a été
arrêté par `TaskStop` : le processus est mort SANS exécuter son `trap`. Le verrou
est resté posé trois heures. Pire, la version suivante du même script abandonnait
l'attente au bout de trente minutes et bâtissait SANS le verrou — puis son `trap`
aurait retiré le verrou d'un autre.

> **Avant de croire qu'un verrou appartient à une autre session, comparer sa date
> de création (`stat -f %Sm`) à ses propres lancements.** Un verrou plus vieux que
> tout build en cours est presque toujours le sien, laissé par un processus tué.

Règles :

1. Une attente de verrou ne se termine JAMAIS par « on y va quand même » :
   `until mkdir "$L" 2>/dev/null; do sleep 5; done`, sans plafond.
2. Le `trap` qui retire le verrou se pose APRÈS le `mkdir` réussi, jamais avant —
   sinon un script interrompu pendant l'attente retire le verrou d'autrui.
3. Arrêter un script qui détient le verrou ⇒ vérifier tout de suite que le verrou
   est parti (`ls -d .git/ios-build.lock`), et le retirer soi-même sinon.
4. Le bloc-notes d'un workflow peut être PARTAGÉ entre agents : écrire ses journaux
   dans un sous-dossier à son nom (ici `n13137/`), jamais à la racine.
