# Pointeur de continuité — itérations UI/UX **web** (`w`)

> Fichier court et à jour qui dit **d'où part la prochaine itération web** et
> **où elle fusionne**. Il évite la divergence : une seule ligne de travail,
> synchronisée avec le trunk. (Le gros `branch-tracking.md`, 1,2 Mo, est
> l'HISTORIQUE multi-plateforme ; ce pointeur-ci est le plan de bord web.)

## Doctrine de branche (web)

| | |
|---|---|
| **Base de départ** de chaque itération web | `origin/dev` (resync à chaque tour) |
| **Cible de la PR** | `dev` |
| Branche de travail de la session courante | `claude/practical-fermat-o9iiqc` |

**Pourquoi `dev` et non `main`.** La directive porteur (CLAUDE.md §🚦) tranche :
`dev` **est le staging**, et Claude y est autonome sur tout — toute PR vers `dev`
**fusionne automatiquement dès la CI verte** (#9226). `main` est la branche de
**PUBLICATION**, alimentée par `dev` ; la production n'y reçoit que ce que le
staging a validé (#9223). Viser `main` directement contourne le staging et fait
fermer la PR (précédent documenté dans `branch-tracking.md`, correction
2026-09-05). « Fusionner avant la prochaine itération pour éviter la divergence »
se réalise donc **par `dev`** : c'est le trunk unique sur lequel la ligne web
reste synchronisée, et qui remonte vers `main` par le chemin de publication
normal.

## Protocole par itération

1. `git fetch origin dev` puis repartir de `origin/dev`.
2. Balayer l'anti-doublon : `ls docs/analyses/uiux/` (numéros `w` pris) **et**
   `search_pull_requests` sur le **nom du fichier cible** (pas le numéro).
3. Développer en TDD, pousser tôt le squelette, committer sur la branche de travail.
4. Ouvrir la PR vers `dev` ; elle auto-fusionne au vert. Supprimer la branche
   fusionnée ; la session suivante repart de `dev` à jour.
5. Annoter l'analyse `## ✅ Statut : CORRIGÉ (iter-Nw)` et mettre à jour ce pointeur.

## Dernière itération

| itération | date | branche de travail | PR | état |
|---|---|---|---|---|
| **74w** | 2026-10-21 | `claude/practical-fermat-to2xb3` | [#11384](https://github.com/isopen-io/meeshy/pull/11384) → `dev` | ✅ mergé |
| **75w** | 2026-10-24 | `claude/practical-fermat-o9iiqc` | à ouvrir → `dev` | ⏳ |

**75w** — cohérence du thème clair/sombre : la vignette « Signature » du sélecteur
d'apparence (`appearance-picker-sections.tsx`) DÉRIVE désormais des cotes canoniques
du fond (`backdropStyleVars()` + `withAccent`, dégradé partagé
`styles/appearance-picker.css`) au lieu d'un dégradé jumeau codé en dur qui restait
sombre en thème clair. 3 littéraux de couleur retirés, jumelle divergente supprimée.
Analyse : `docs/analyses/uiux/2026-10-24-iteration-75w.md`.

**74w** — i18n du flux de connexion par lien magique (`magic-link-{validation,
panel,flow}.tsx`) : 11 clés `magicLink.*` ×7 langues + câblage `translate` +
témoin `magic-link-i18n.test.tsx`. Analyse : `docs/analyses/uiux/2026-10-21-iteration-74w.md`.

## Note sur les analyses historiques 60w → 73w

Elles portaient sur le **legacy** Next.js (`apps/web` d'avant #7668, routes `app/`).
Ce code a quitté le dépôt le 2026-09-24. **Leurs pistes « différées 74w+ » pointent
du code supprimé et ne se rejouent pas.** La routine repart d'une revue fraîche de
l'`apps/web` actuel (Vite + Preact). Toutes sont annotées `CORRIGÉ` et closes pour
leur époque.

## Prochaine itération : **76w**
Revue fraîche `apps/web` — voir les pistes 76w+ en pied de
`docs/analyses/uiux/2026-10-24-iteration-75w.md`.
