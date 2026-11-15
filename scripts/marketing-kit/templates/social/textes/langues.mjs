// Une chaîne dans les sept langues du kit, dans l'ordre de KIT_LANGS.
export const t = (fr, en, es, de, it, pt, ar) => ({ fr, en, es, de, it, pt, ar })

// Le hashtag de campagne, décliné UNE fois par langue puis figé (contenu-par-format.md § 6).
// fr / en / es sont ceux du plan ; de / it / pt / ar sont proposés ici et restent à figer.
export const HASHTAG = t(
  '#DisBonjourAuMonde',
  '#SayHiToTheWorld',
  '#SaludaAlMundo',
  '#SagHalloZurWelt',
  '#SalutaIlMondo',
  '#DigaOiAoMundo',
  '#قل_مرحبا_للعالم',
)
