## Un ensemble de rouges qui CHANGE d'une exécution à l'autre décrit la machine, pas le dépôt (2026-11-28, #20711)

Deux exécutions de la suite complète de la passerelle, à vingt minutes
d'intervalle, sur deux arbres qui ne diffèrent que par une fusion de `dev` :

| exécution | suites rouges non-image |
|---|---|
| 1 | `route-manifest-ratchet`, `email-domain-guard`, `bring-routes`, `sticker-pack-assets`, `admin-route-level-guard`, `user-management-email-normalization` |
| 2 | `conversation-list-message-request`, `tsc-never-loaded-tests-ratchet`, `no-stale-trust-proxy-claim`, `admin/user-write-addresses`, `communities/addition-budget-19812` |

**Aucune intersection.** Pendant que six suites de traitement d'image restaient
rouges à l'identique aux deux exécutions, pour une cause nommée par leur propre
trace (`heif-convert ENOENT` — un binaire absent du conteneur).

Relancées SEULES, les cinq de la seconde exécution rendent **5 suites / 35
témoins verts**. C'étaient des flakes de CONTENTION, et la cause était une faute
de méthode : **deux suites complètes en vol en même temps**, plus des veilles de
CI. Les durées le disaient aussi — 66 s et 45 s sur des suites qui passent en
quelques secondes seules.

> **Le discriminant n'est pas le CONTENU d'un rouge, c'est sa STABILITÉ d'une
> exécution à l'autre.** Un ensemble qui change décrit la machine ; un ensemble
> qui se répète à l'identique décrit quelque chose de réel — l'arbre, ou
> l'environnement, et c'est la trace qui tranche entre les deux.

Et le piège était **amorcé pour être cru**. `route-manifest-ratchet` assemble le
serveur entier, donc il importe par transitivité tous les fichiers de n'importe
quel lot ; il rougit légitimement quand des routes bougent, et la fusion de `dev`
venait justement d'en apporter. Le rouge le plus plausible du lot — celui qu'on
aurait expliqué sans effort, et « corrigé » en régénérant un manifeste — était un
artefact de charge.

Le `CLAUDE.md` de la racine porte déjà « un rouge local que la CI ne reproduit
pas est un rouge d'arbre jusqu'à preuve du contraire », avec ses trois artefacts
périmés. **Il faut une cause de plus à écarter avant l'arbre : la CHARGE de la
machine.** Donc deux règles, et la seconde ne coûte rien :

1. **Ne jamais lancer deux suites complètes en parallèle** — ni une suite
   complète en même temps qu'une autre tâche lourde. Le gain de temps est nul
   (les mêmes cœurs), le coût est un ensemble de rouges à instruire.
2. **Confronter un ensemble de rouges à celui de l'exécution précédente avant de
   le lire.** C'est gratuit, et c'est la seule mesure qui distingue un flake de
   charge d'un défaut — avant d'ouvrir le premier fichier.

Corollaire de compte rendu : les deux familles se RAPPORTENT séparément. « 19
rouges » est un chiffre qui n'apprend rien ; « 6 déterministes par outil absent,
5 verts en isolation » dit où regarder, et dit qu'il n'y a rien à corriger.

Détail : `tasks/realtime-sync-audit-2026-11-28-20711.md`, et le commentaire de
gate de la PR #20777.
