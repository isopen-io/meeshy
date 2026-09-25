## 2026-08-23 — « Je n'ai pas trouvé de garde » n'est pas « il n'y a pas de garde » (239i)

239i a laissé sciemment une clé i18n orpheline au catalogue, en s'appuyant sur
deux affirmations dont AUCUNE ne tenait :

1. « Le cliquet ne compte que les clés référencées, elle en sort d'elle-même. »
   Vrai du cliquet — **et hors sujet**. Une garde DISTINCTE,
   `test_everyAppCatalogIdentifierKeyIsReferencedInCode`, applique la contrainte
   INVERSE : aucune clé du catalogue ne doit rester sans appelant. Je l'avais
   cherchée par `grep` sur `orphan`, `unused.*key`, `cleUtilisee` — trois
   formulations devinées, aucune n'étant son nom réel.
2. « Retirer une clé du catalogue a cassé `main` en 236i. » **236i disait
   l'inverse** : là-bas une clé avait été retirée **pendant qu'un site la
   référençait encore**. Le défaut était le référencement orphelin, pas la
   suppression.

Corollaires :

- **Pour prouver qu'aucune garde ne couvre un artefact, lister les tests qui LE
  LISENT** — pas grepper des noms qu'on imagine. Une recherche par formulation
  devinée ne peut produire qu'un faux négatif, et un faux négatif ici se paie
  d'un rouge en CI.
- **Une leçon passée invoquée de mémoire doit être RELUE avant d'être
  appliquée.** Citer 236i sans la rouvrir m'a fait en tirer la règle
  symétriquement opposée à ce qu'elle disait. Une leçon mal citée est pire
  qu'aucune leçon : elle porte l'autorité d'une erreur déjà payée.
- **Un catalogue partagé a souvent deux gardes de sens opposé.** Retirer le
  dernier appelant d'une clé n'est pas neutre : cela crée une clé morte, et
  oblige donc à retirer la clé dans le MÊME lot.
