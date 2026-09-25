## Leçon 445 — `log show` FILTRE le niveau info : trois passes perdues à conclure « le code ne tourne pas » sur un journal tronqué

**Le fait.** Pour trancher #4879 j'ai instrumenté le chemin média — ingestion,
placement, quatre refus silencieux. Puis :

```
xcrun simctl spawn <sim> log show --last 2m --predicate 'process == "Meeshy"'
→ AUCUNE de mes lignes
```

J'en ai conclu, trois fois de suite, que le code ne s'exécutait pas — et j'ai
construit trois hypothèses sur ce vide. Les lignes existaient, s'exécutaient, et
étaient **filtrées** : `log show` n'inclut ni `info` ni `debug` sans `--info` /
`--debug`. Les seules qui passaient étaient les `.error` d'un voisin, ce qui
rendait le journal *crédible* — il n'avait pas l'air vide, il avait l'air
complet.

```
xcrun simctl spawn <sim> log show --info --last 5m --predicate '…'
→ ingest photothèque … mime=image/jpeg     ← elle était là depuis le début
```

> **Un journal filtré ne se distingue pas d'un journal vide** — et un voisin qui
> loggue en `.error` fait croire que le filtre n'existe pas. Avant de conclure
> « ce code ne tourne pas » depuis un journal, vérifier qu'on lit le NIVEAU
> auquel on a écrit.

Deux corollaires du même lot :

- **`strings` sur l'exécutable de l'app ne prouve rien** : le code d'une app
  iOS en debug vit dans `Meeshy.debug.dylib`, pas dans le binaire. Et une
  chaîne de `os.Logger` interpolée n'y apparaît qu'en fragments — chercher un
  sous-mot (`applyContentMedia`), jamais la phrase entière avec ses accents.
- **Écrire au bon niveau.** Un log qui sert à DIAGNOSTIQUER un chemin muet a
  intérêt à être `.error`, ou à être lu avec `--info` — sinon le réparateur
  qu'on vient de créer (§ 443) est lui-même invisible.
### AMENDEMENT du même jour — le vérificateur des faux positifs existe, et ce n'est pas un outil

Cette leçon affirmait qu'« il n'existe aucun vérificateur des faux positifs ».
**C'est faux, et la correction vient d'une session voisine.** Quelques heures
après avoir écrit ce qui précède, j'ai produit un faux positif d'une autre
espèce : un relevé sur `tasks/lessons.md` m'a fait conclure que le `CLAUDE.md`
racine citait un numéro de leçon AMBIGU. La mesure avait l'air propre et
désignait un défaut dans le document le plus lu du dépôt.

Ce qui l'a attrapée n'est pas une vérification. C'est que **j'allais citer les
deux leçons dans l'issue** — et qu'en les ouvrant pour les recopier, j'ai vu
« 288 », « 288 bis », « 288 ter », « 288 quater » : une famille à suffixes, pas un
doublon. Mon motif `^## Leçon [0-9]+` avait tronqué au nombre.

> **Une mesure se relit toute seule ; une preuve CITÉE oblige à rouvrir la
> source.** Le compte se produit sans jamais rouvrir le fichier — l'extrait, non.

D'où la discipline, qui est le vérificateur manquant :

**Une issue, un commentaire ou un commit qui ACCUSE doit contenir l'EXTRAIT, pas
seulement le compte.** Deux lignes du fichier valent mieux qu'un nombre juste,
non pas parce qu'elles convainquent mieux le lecteur, mais parce que **les
produire force l'auteur à retourner à la source** — c'est-à-dire à faire
exactement ce qu'un faux positif empêche de faire.

Cela vaut pour les trois formes que ce dépôt écrit le plus : « N sites font X »
(citer deux), « ce champ n'est lu nulle part » (citer la recherche ET son
résultat vide), « ces deux choses divergent » (citer les deux côtés, élément par
élément). Le coût est de quelques lignes ; le bénéfice est le seul contrôle
gratuit qu'on ait de ce côté-là de l'asymétrie.
