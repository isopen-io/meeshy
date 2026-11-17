## Une attente de module dans le socle le DÉCOUPE, et le condensat d'un script en ligne dépend de l'outil qui l'a écrit (2026-11-17, #18986, #18988)

**Une attente de module (`await` au niveau du module) n'est pas locale.** Pour
lire `/config.json` avant que `apiConfig` s'évalue, la première forme de #18988
posait un `await loadRuntimeConfig()` dans `src/lib/api/config.ts`. Tout module
qui en dépend devient asynchrone, et la construction a redécoupé le socle pour
garder l'ordre d'évaluation : mesuré par `measure-weight.mjs`, la première
peinture passait de **98,5 Ko en 24 requêtes à 120,3 Ko en 72**, sans une ligne
de code ajoutée au socle. La lecture est devenue SYNCHRONE (comme l'était le
script bloquant qu'elle remplace), et le parallélisme vient d'un `prefetch` du
document — un `preload` n'est PAS repris par une requête synchrone (Chromium le
dit en console), un `prefetch` l'est (une requête, mesurée).

> Avant d'introduire un `await` de module dans un fichier du socle, MESURER le
> socle : l'effet n'est pas dans le fichier touché, il est dans le découpage.

**Le condensat CSP d'un script en ligne GÉNÉRÉ dépend de l'outil qui l'a écrit.**
Les scripts de démarrage des landings sont minifiés par `Bun.build`
(`scripts/lib/minify-inline-script.ts`) : leur texte, donc leur `sha256`, suit la
version de bun. Les condensats de `nginx.conf` se calculent donc avec la bun que
la CI et l'image épinglent (`BUN_VERSION`, 1.3.14 au 2026-11-17), jamais avec
celle du poste ; vérifié ici en reconstruisant sous 1.3.14 (identique à 1.4.4
pour ces scripts — ce ne sera pas toujours vrai). Une montée de bun fera rougir
`check-csp-hashes.mjs` : c'est voulu, `--write` réécrit la région, et le diff de
`nginx.conf` montre chaque script que l'origine accepte désormais d'exécuter.
