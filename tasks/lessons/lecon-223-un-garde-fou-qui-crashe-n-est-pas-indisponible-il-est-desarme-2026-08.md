## Leçon 223 — un garde-fou qui CRASHE n'est pas indisponible, il est désarmé (2026-08-17, livraison /chat partagé)

**Ce que j'ai fait de travers.** J'ai rapporté « ESLint est cassé à l'échelle du
dépôt (`Converting circular structure to JSON`, ESLint 10 contre config héritée),
hors périmètre » et je suis passé à autre chose. C'était une abdication déguisée
en constat : je nommais correctement le symptôme, puis j'en tirais la conclusion
la plus confortable — que ce n'était pas mon affaire.

**Le diagnostic tenait en trois questions.** Aucune ne demandait plus de dix
minutes :

1. *Qui exporte quoi ?* `eslint-config-next@16` ship des configs **plates**
   (`Linter.Config[]`, cf. `dist/index.d.ts`). Les passer à `FlatCompat.extends()`
   — le pont eslintrc → flat — fait valider un objet plat par le validateur
   eslintrc, qui `JSON.stringify` la config pour formater ses erreurs et bute sur
   le cycle `plugins.react → configs → plugins`. Le message parlait de JSON parce
   que la panne était dans le FORMATEUR D'ERREUR, pas dans la config.
2. *Qui supporte quoi ?* `eslint-plugin-react@7.37.5` — dernière version publiée,
   dépendance DURE de `eslint-config-next` — appelle encore
   `context.getFilename()`, retiré en ESLint 10, et plafonne son peer à `^9.7`.
   ESLint 10 est donc simplement inutilisable avec la stack Next : le `"eslint":
   "^10.8.0"` du `package.json` ÉTAIT le bug.
3. *Qui gardait la porte ?* `continue-on-error: true` sur l'étape Lint de la CI.
   Personne ne l'a vu tomber.

**La leçon.** Un outil de qualité qui plante n'est pas « momentanément
indisponible » : il est **désarmé**, et le code dérive derrière. La mesure une
fois ESLint relancé : **3 756 erreurs**, dont **2 631 `no-explicit-any`** — contre
la règle explicite « No `any` types - ever » du CLAUDE.md. Rien de tout cela
n'était visible tant que le linter mourait avant de lire la première ligne.

**Le corollaire qui m'a coûté deux erreurs de plus.** En reportant la règle
`no-restricted-imports` de l'ancien `.eslintrc.local.json` (mort depuis ESLint 9,
qui n'ouvre plus le format eslintrc), j'ai gardé ses `patterns` — dont la
sémantique est **gitignore** : `@/components/ui` couvre aussi
`@/components/ui/**`. La règle interdisait donc exactement l'import direct que
son propre message recommande. `paths` matche le spécificateur EXACT, c'est-à-dire
le fichier barrel lui-même. **Une règle inerte depuis longtemps n'a jamais été
éprouvée : la réactiver, c'est la relire, pas la recopier.** Même famille que la
leçon 219.

Et une fois la règle vivante, elle a immédiatement trouvé deux vrais défauts dans
mon propre code du jour : un `eslint-disable-next-line
react-hooks/exhaustive-deps` devenu mensonger (les dépendances étaient
exhaustives depuis que j'avais sorti `t` du corps de l'effet) et un `useMemo` qui
dépendait de champs non déclarés. Les deux corrigés en supprimant le contournement,
jamais en élargissant le silence.

**Règle pour la prochaine fois.** Devant un gate cassé : ne jamais écrire « hors
périmètre » sans avoir répondu aux trois questions ci-dessus. Le coût du
diagnostic est presque toujours inférieur au coût de ce que le gate laissait
passer pendant son sommeil. Et quand la conclusion est un pin de version, elle
s'accompagne d'un `ignore` Dependabot MOTIVÉ — sinon le prochain bump automatique
rendort le gate.
