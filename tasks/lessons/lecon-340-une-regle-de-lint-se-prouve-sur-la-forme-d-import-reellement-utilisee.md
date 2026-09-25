## Leçon 340 — Une règle de lint se prouve sur la forme d'import RÉELLEMENT utilisée

Même cycle. Le lot posait trois `no-restricted-imports` interdisant `lucide-react`, la fonte
`@phosphor-icons/web` et `next-themes`. La clé `paths` de cette règle ne matche que le nom **EXACT**
du module. Or la fonte Phosphor s'installe par un import de sous-chemin CSS —
`@phosphor-icons/web/regular/style.css`, sa forme documentée — et lucide s'importe couramment icône
par icône. Un fichier fautif **sur les deux interdits** passait `eslint` en **exit 0**.

C'est la loi 4 (« un contrôle existe s'il a un effet ») appliquée à l'outillage : la règle était
rendue dans la config, lue en revue, citée dans le rapport — et inerte. Pire qu'absente : un agent
qui suit la doctrine (« JAMAIS la fonte @phosphor-icons/web ») se croit gardé.

> **Une garde de lint ne se relit pas, elle se SONDE.** Écrire le fichier que la règle est censée
> refuser, sous la forme que quelqu'un écrirait vraiment, et vérifier que le lint ÉCHOUE. Sans cette
> sonde en témoin permanent, la garde retombe inerte au premier refactor de la config.

Deux détails qui coûtent du temps si on ne les sait pas : `paths` → `patterns` avec des groupes
`[root, root/**]` (minimatch : `*` ne traverse pas `/`, `**` si) ; et la sonde ne peut pas tourner
dans le VM de Jest — le chargeur de config plate d'ESLint 9 fait un `import()` dynamique et rend
`A dynamic import callback was invoked without --experimental-vm-modules`. On appelle la vraie CLI en
processus fils (`--stdin --stdin-filename`, `--format json`), ce qui a le mérite d'être exactement ce
que la CI exécute. `ESLint.lintText` n'exige pas que le fichier existe sur le disque : la sonde ne
pollue donc pas le dépôt.
