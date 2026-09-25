## Leçon 15 — Un widen de regex de langue (639-3) doit couvrir TOUS les schémas de code langue (2026-07-03, itération 89)
L'itération 86-B avait élargi `CommonSchemas.language` (`validation.ts`) de `[a-z]{2}` à `[a-z]{2,3}`
pour accepter `bas/ksf/nnh/dua/ewo` (639-3 camerounais canoniques). Mais un **second** schéma,
`languageCodeSchema` (`attachment-validators.ts`), gardait `[a-zA-Z]{2}` → transcriptions/traductions
`bas` rejetées au trust boundary alors qu'un user peut avoir `systemLanguage: 'bas'`. **Règle : un fix
de validation de langue doit grep TOUS les regex `[a-zA-Z]{2}`/`[a-z]{2}` du monorepo (pas juste le
premier trouvé) — les codes 639-3 supportés traversent transcriptions, maps de traduction, préférences
user, et messages ; chaque schéma est un trust boundary distinct.**
