## 2026-11-22 — Un texte copié du web repasse le cliquet du texte natif (#20314)

Le miroir iOS d'une tranche web reprend ses textes au mot près. C'est voulu (même
mot sur les trois plateformes), mais le web et le natif ne sont pas gardés par le
même cliquet : un libellé qui passe sur le web peut faire rougir
`scripts/check-verbosity-native.mjs` une fois posé dans `Localizable.xcstrings`.

### Ce qui s'est passé

La PR #20314 (la Veilleuse offerte au 3e jour, iOS) a copié l'explication web
« Trois jours de Flamme : les aïeux t'en confient une. Elle garde ta Flamme
allumée un jour où tu ne viens pas. » (109 caractères). La famille `game2` est
passée de 22 à 23 libellés de plus de 80 caractères : « Gardes iOS (texte) »
et « Graphe des modules Android » ont rougi au premier dispatch. Les gardes locales
listées dans la PR (`house_rules.py`, cohésion, enregistrement des tests, accent,
`xcstrings_to_android.py --check`) ne comprenaient pas ce cliquet.

### La règle

1. Tout lot qui ajoute une clé à un catalogue iOS ou Android lance
   `node scripts/check-verbosity-native.mjs` avant de pousser. Le script nomme les
   libellés refusés.
2. Un libellé de plus de 80 caractères se raccourcit, jamais le budget ne monte.
3. Si le texte vient du web, il se raccourcit aussi sur le web, dans les sept
   langues, pour que le même moment dise la même chose partout.
