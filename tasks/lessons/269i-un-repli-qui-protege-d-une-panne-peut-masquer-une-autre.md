## 269i — un repli qui protège d'une panne peut MASQUER une autre

- **Un `defaultValue` rend INVISIBLE l'absence de sa clé au catalogue.** La garde
  qui traque les clés non résolues (`test_everyUsedIdentifierKeyResolvesInDevelopmentLanguage`)
  ne regarde que les appels **sans** `defaultValue` — et c'est justifié : un repli
  garantit qu'on n'affichera jamais l'identifiant brut à l'écran. Mais cette
  garantie porte sur le CRASH VISUEL, pas sur la LANGUE. Une clé absente du
  catalogue n'a aucune localisation : son `defaultValue` s'affiche **tel quel dans
  les sept locales**. Mesuré : 29 chaînes, dont **sept libellés VoiceOver**, sont
  servies en français à tous les lecteurs non francophones — et en français NON
  ACCENTUÉ aux francophones, personne n'ayant relu ce littéral comme du texte
  affiché. **Demander d'un repli : de quoi protège-t-il exactement, et qu'est-ce
  que sa présence dispense de vérifier ?**

- **Ne pas produire 102 chaînes de traduction de sa propre autorité.** Sur 26
  clés absentes, 9 ont déjà leur traduction ailleurs dans le catalogue et se
  réutilisent sans rien inventer ; les 17 autres demanderaient une traduction
  neuve en six langues dont l'arabe. C'est du texte expédié à des utilisateurs,
  invérifiable depuis cet environnement — et **une traduction arabe approximative
  est un défaut pire que le repli français honnête qu'elle remplacerait**. C'est
  le principe déjà écrit dans `untranslatableKeys` pour les CGU, appliqué au
  VOLUME plutôt qu'à la nature du texte. Mesurer, tabuler ce qui se réutilise,
  et remettre la décision — pas deviner.

- **Un lot qui ne débloque rien peut valoir d'être fait, à condition de le dire.**
  Les 186 dernières réconciliations ne rendent aucun écran épinglable : leurs 40
  fichiers sont tous retenus par l'autre règle. Leur valeur est que le code cesse
  de mentir, et qu'ils basculeront sans repasser par là le jour où leurs
  traductions arrivent. **Annoncer « zéro gain sur la métrique visible » évite de
  laisser croire à un gain qu'on n'a pas obtenu.**
