## Leçon 368 — Une règle GÉNÉRALE doit vérifier sa prémisse SUR LE SITE qu'elle modifie

`dev` rouge le 2026-08-31 (run `33363098057`, `failure`, 3 échecs sur 22 044).
Le commit fautif remplaçait, dans `routes/me/consents.ts` :

```
details: { issues: error.issues }   →   violations: error.issues.map(…)
```

sur une prémisse écrite dans son propre commentaire : « `errorResponseSchema` ne
déclare pas `issues`, donc fast-json-stringify les retire ». La prémisse est
**vraie en général** — c'est même le défaut que l'issue #4487 décrit — et
**fausse pour cette route**, qui l'avait déjà résolu en ÉTENDANT le schéma :
`badRequestResponseSchema` déclare `issues`, et c'est lui qui est lié au 400.
La réfutation était à 170 lignes, dans le même fichier.

> Une généralisation juste appliquée sans regarder le site particulier **défait
> les solutions particulières qui l'avaient déjà résolue**. Le danger n'est pas
> la fausse règle : c'est la règle VRAIE, dont la vérité rend superflu de
> vérifier qu'elle s'applique ici.

Deux aggravations qui valent d'être notées séparément :

1. **Le remplaçant perdait l'information que l'issue existait pour livrer.** Le
   doc-comment de `zodIssueSchema`, deux cents lignes plus haut, l'écrivait :
   `path` seul ne dit pas tout, une clé refusée par `.strict()` laisse `path`
   VIDE et vit dans `keys`. La projection `path: issue.path.join('.')` rendait
   donc `''` sur un `unrecognized_keys` — le refus cessait de nommer le champ,
   c'est-à-dire le défaut d'origine rouvert sous une autre clé.
2. **Le témoin qui l'aurait dit existait et était vert.** Il n'a pas manqué ; il
   n'a pas été exécuté — le run a été annulé au bout d'une minute quarante par
   la poussée suivante (#4395). La famine de CI ne retarde pas seulement les
   verdicts : elle laisse passer des rouges que le dépôt savait détecter.

Résolution : les deux clés sont servies, ce qui n'est pas une jumelle
divergente — elles sortent d'`error.issues` dans UNE expression et ne peuvent
pas diverger. Ce qui les sépare est le NIVEAU de déclaration, donc ce qu'elles
ont le droit de porter : `violations` est la clé générique de l'enveloppe
partagée (`items: { path: string, message: string }`, elle ne peut pas porter
davantage), `issues` l'extension que la route déclare avec la forme que Zod émet
réellement. L'enveloppe partagée prévoit ce cas en toutes lettres.

**La question à poser à tout correctif qui invoque une règle générale : ai-je
vérifié la prémisse sur CE fichier, ou seulement en principe ?** Elle se répond
par une lecture, pas par un raisonnement.
