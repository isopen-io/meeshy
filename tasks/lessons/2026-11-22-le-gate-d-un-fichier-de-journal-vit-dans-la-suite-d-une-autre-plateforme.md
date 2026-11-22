## Le gate d'un fichier de JOURNAL vit dans la suite d'une AUTRE plateforme (2026-11-22, #20336, cycle 217)

**2026-11-22, cycle 217 de la routine temps réel, #20336.**

### Ce qui s'est passé

Un lot purement `apps/web` a été prouvé par la suite `apps/web` (4 679 verts),
`tsc --noEmit` et trois exécutions. Il a été poussé, sa PR ouverte, et la CI l'a
rendu ROUGE sur un fichier que la suite web ne regarde pas : le fichier de
leçon, gardé par `services/gateway/src/__tests__/journal-one-file-per-entry-guard.test.ts`
(#7711 — un fichier par entrée, première ligne en `## `, exactement un titre
`## ` hors bloc de code).

Le fichier commençait par `# ` et portait cinq sous-titres `## `.

### La règle

> **Un fichier de dépôt — leçon, décision, `CLAUDE.md`, manifeste — n'est pas
> gardé par la suite de la plateforme qu'il DÉCRIT, mais par celle qui héberge
> son cliquet.** Ici, tous les cliquets transverses du dépôt (journaux à un
> fichier par entrée, chemins cités par les `CLAUDE.md`, budget de taille des
> fichiers partagés, numérotation des leçons) vivent dans `services/gateway`.

La question à poser avant de pousser n'est donc pas « ai-je joué la suite de ma
plateforme ? » mais **« qui garde chacun des fichiers que je viens d'écrire ? »**
— et la réponse se trouve en cherchant le nom du dossier, pas celui du lot :

```bash
grep -rln "tasks/lessons" services/*/src/__tests__ apps/*/src
```

### Le corollaire qui coûte le plus

Le cliquet assertait `expect(malformed).toEqual([])`. **Un second fichier,
déjà sur `dev`, était malformé** (`…-un-abonnement-qui-joint-une-room-….md`,
arrivé par `ba386450f`) : le gate était donc ROUGE SUR LA BASE avant ce lot.

Cela change ce qu'on a le droit de conclure, dans les deux sens :

- on ne peut pas dire « ce rouge n'est pas le mien » — le lot en ajoutait bien
  un second exemplaire ;
- on ne peut pas non plus réparer le sien et s'arrêter — **un cliquet qui
  assert le VIDE n'a pas de verdict partiel** : tant qu'un fichier de la base
  reste malformé, la PR reste rouge quoi qu'elle fasse.

> **Devant un cliquet d'inventaire vide rendu rouge, compter les entrées avant
> de s'attribuer le rouge.** Une entrée héritée et une entrée neuve se
> présentent à l'identique, et l'ordre alphabétique ne dit pas laquelle est
> laquelle. Réparer les deux est alors la seule manière de rendre sa propre
> preuve lisible.

### Ce qui aurait coûté une commande

Jouer le cliquet du journal après avoir écrit le fichier de leçon :

```bash
cd services/gateway && npx jest src/__tests__/journal-one-file-per-entry-guard.test.ts
```

0,8 seconde, contre un aller-retour de CI sur des runners saturés.
