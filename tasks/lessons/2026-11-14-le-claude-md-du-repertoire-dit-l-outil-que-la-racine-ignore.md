# Le `CLAUDE.md` du répertoire dit l'outil que la racine ignore

*2026-11-14, cycle 158. Contexte : vérification d'un lot Android depuis un
conteneur sans SDK Android.*

## Ce qui s'est passé

Pour prouver qu'un lot Kotlin compilait, j'ai **reconstruit à la main** un
harnais Gradle « Kotlin pur » : un projet qui pointe ses `srcDirs` sur
`core/model`, applique le générateur de catalogue, et résout depuis Maven
Central. Une demi-heure, deux échecs de mémoire mal diagnostiqués, un `429` du
miroir Maven.

**Il existait déjà, committé, documenté, et avec un raccourci :**

```bash
./apps/android/meeshy.sh jvm-check
```

`apps/android/scripts/jvm-check/` compile et teste `:core:model`, `:core:crypto`
et `:core:e2ee`, sait exclure les fichiers liés à Android, et range sa sortie où
la CI l'attend. Ma reconstruction ne faisait que `:core:model`, et moins bien.

## Pourquoi je ne l'ai pas trouvé

Le `CLAUDE.md` **racine** ne le mentionne pas. Celui d'`apps/android` le porte en
tête, dans son bandeau de directive :

> **`:core:model` se vérifie en local, en deux minutes : `./apps/android/meeshy.sh jvm-check`.**

Je suis parti du journal du cycle précédent, qui écrivait « `gradle -p
scripts/jvm-check` » — un chemin RELATIF à un répertoire que le journal ne
nommait pas. J'ai lu ce chemin comme « un harnais de brouillon », et j'ai conclu
qu'il avait disparu avec la session.

> **Un chemin relatif dans un journal ne dit pas d'où il part.** Et un journal
> n'est pas un index d'outils : il raconte une session, il ne garantit pas que ce
> qu'il cite soit hors du dépôt.

## La règle

**Avant de construire un outil de vérification, lire le `CLAUDE.md` du
répertoire concerné — pas seulement celui de la racine.** Les outils d'un
domaine sont documentés chez lui, parce que c'est là que la contrainte qui les
justifie est écrite (ici : « les conteneurs n'atteignent pas `dl.google.com` »).

Et le réflexe qui coûte trois secondes :

```bash
ls <domaine>/scripts; grep -rn "<ce que je veux faire>" <domaine>/CLAUDE.md <domaine>/*.sh
```

## Le corollaire, et il est plus large

Le dépôt porte déjà la leçon inverse (cycle 87 bis) : *« le coût d'un outil
laissé hors du dépôt ne se paie pas en mémoire, mais en travail fait deux
fois »*. Celle-ci en est la moitié manquante : **l'outil peut être DANS le
dépôt et rester introuvable depuis la racine.** Ranger un outil est nécessaire ;
le rendre trouvable depuis l'endroit où la question se pose l'est tout autant.
