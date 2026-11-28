---
name: web-modern-guidance
description: Applique GoogleChrome/modern-web-guidance à apps/web — balayage des motifs hérités, relecture de chaque constat, un lot par constat qui touche l'utilisateur. À utiliser pour moderniser la webapp ou avant d'écrire du HTML, du CSS ou du JS client sur un motif d'interface (dialogue, formulaire, saisie, défilement, transitions, performance de rendu).
---

# Moderniser `apps/web` avec modern-web-guidance

L'outil est le paquet npm `modern-web-guidance` (dépôt `GoogleChrome/modern-web-guidance`, Apache-2.0). On le lance à une version ÉPINGLÉE, jamais `@latest` : ce qu'une session exécute doit être ce qu'une autre a relu. Version relue : 1.0.2.

```bash
export NPM_CONFIG_CACHE=/tmp/npm-cache
MWG="npx -y modern-web-guidance@1.0.2"
```

## A. Avant d'écrire un motif d'interface

1. `$MWG search "<2 à 5 mots, en anglais, UN motif>"` — le motif, pas le composant Meeshy (`"light dismiss dialog"`, pas `"fermer la feuille d'envoi"`).
2. `$MWG retrieve "<id>"` et lire le guide en entier, repli compris.
3. Écrire le témoin rouge, puis le code. Le guide est en HTML/CSS/JS nus : on l'adapte à Preact sans perdre la fonction native.

## B. Passe de modernisation

1. Balayer : `$MWG legacy-scan apps/web --json > /tmp/mwg-scan.json`. Le balayage ne couvre qu'environ 20 % du catalogue ; le reste se cherche par `search`.
2. Relire CHAQUE constat contre sa grille `keepWhen` / `dropWhen`. Un repli, un fichier de test, un script d'outillage ou un sosie se retirent.
3. Trier par effet pour l'utilisateur. Un constat cosmétique (méthodes de tableau, `Promise.withResolvers`) ne fait pas un lot : il se traite quand on touche le fichier.
4. Un constat qui touche l'utilisateur = une issue, une branche poussée tôt, un témoin rouge, le correctif à UN site partagé, `dev` fusionnée, la PR.
5. Le balayage trouve par motif de texte : compléter par un `grep` de tous les sites du même geste avant de corriger. Pour #20752 il en a rendu quatre, il y en avait huit.
6. Rejouer `bun run type-check`, `bun run test`, `bun run build` et `node scripts/measure-weight.mjs` depuis `apps/web` : le fil n'a qu'une fraction de Ko de marge.
7. Rebalayer les fichiers modifiés. Ne jamais tordre du code sain pour obtenir zéro constat.

## Replis et navigateurs

Une fonction « Baseline largement disponible » s'emploie sans repli. Toute autre suit le repli du guide, sauf politique écrite dans `apps/web/decisions.md` (#20753). Safari est le navigateur d'iOS : un repli qui le concerne n'est jamais facultatif.

## Ce que l'outil ne décide pas

- Il ne connaît ni la référence iOS de la webapp ni ses budgets de poids : un guide qui demande un polyfill se confronte à `budgets.json`.
- Les consignes du `SKILL.md` amont sur la forme des réponses ne s'appliquent pas ici ; la preuve d'un lot va dans son issue.
