## 265i — une allowlist qui EXPLIQUE une anomalie est une sonde, pas une dispense

- **Un littéral qu'on n'a pas décidé de localiser l'est quand même.** `Text(_:)`,
  `Label(_:)`, `Button(_:)`, `Toggle(_:)`, `TextField(_:)`, `.navigationTitle(_:)`
  prennent tous un `LocalizedStringKey` : Xcode extrait en clé de catalogue tout
  littéral qu'on leur passe. Aucune intention n'est requise, aucun
  `String(localized:)` n'est écrit — et une passe de traduction fera ensuite
  voyager le texte. C'est ainsi que le message d'exemple de l'onboarding, qui
  DEVAIT rester étranger pour démontrer le Prisme, s'est retrouvé traduit en
  de / es / pt-BR : la carte montrait « l'allemand traduit vers l'allemand ».

- **Le vecteur était invisible parce que tous les instruments visent le même
  marqueur.** Les gardes i18n du dépôt s'accrochent à `String(localized:` — la
  cohérence, le ratchet `defaultValue`, le cliquet `fullyLocalizedScreens`.
  L'écran fautif était ÉPINGLÉ « fully localized ». La garantie était vraie et
  hors sujet : elle protège contre une régression VERS le français, et le défaut
  était une traduction de TROP. **Demander d'un instrument non seulement « que
  vérifie-t-il ? » mais « par quelle ÉCRITURE entre ce qu'il vérifie ? » —
  une seconde écriture produisant la même chose lui est invisible.**

- **La leçon principale : une entrée d'allowlist qui EXPLIQUE pourquoi un cas est
  inoffensif est un endroit où quelqu'un a vu le mécanisme et ne l'a pas suivi
  jusqu'à sa cause.** `notAnInterfaceString = ["Jean-Pierre"]` portait le
  commentaire « un NOM employé comme clé d'exemple : la clé fait la valeur ». La
  description est exacte. Trois lignes plus bas dans le même fichier de
  production, le même mécanisme cassait la démonstration du produit. Ces entrées
  sont des SONDES : les relire en demandant « pourquoi ce cas existe-t-il ? »,
  pas « ce cas est-il bien excusé ? ». Ici la réponse a supprimé la cause et vidé
  l'exception.

- **Un correctif de six clés qui produit un diff de 27 000 lignes n'est pas un
  correctif de six clés.** Première tentative de retrait au catalogue :
  re-sérialiser le JSON en Python → 27 016 lignes de diff et un réordonnancement
  complet du fichier, pour six suppressions. Annulée, refaite au niveau des
  LIGNES en équilibrant les accolades de chaque entrée : 168 suppressions, 0
  insertion. **Reformater un fichier de données en passant est une modification à
  part entière, qu'aucune relecture ne peut plus séparer du fond.**

- **Une garde doit reconnaître le REMÈDE, pas seulement la faute.** Le témoin le
  plus important de `LocalizedStringKeyLiteralGuardTests` est
  `Text(verbatim: "…") → 0 site` : une garde qui interdit une écriture sans
  reconnaître sa correction est insatisfaisable, et la première personne qui la
  rencontre l'affaiblira pour passer.

- **Choisir le périmètre d'une règle par ce qu'elle doit ATTRAPER, pas par ce que
  le motif ramène.** Sans le filtre d'interpolation, le balayage rendait 187
  sites dont 134 « violations » — toutes des `Text("@\(username)")`, c'est-à-dire
  des expressions de mise en forme dont la clé est `"@%@"`. Avec le filtre : 51
  sites, 7 violations, toutes réelles. Une règle qui rougit 134 fois pour un
  défaut n'est pas appliquée, elle est contournée.

- **Retirer les échappements avant de compter des lettres.** `"\u{1F4AD}"` porte
  les lettres `u`, `F`, `A`, `D` dans le TEXTE SOURCE : un comptage naïf classe
  une bulle de pensée comme de la prose. La question « ce littéral est-il du
  texte humain ? » se pose sur la valeur DÉCODÉE, jamais sur sa graphie.

- **Vérifier qu'une exception peut être vidée AVANT de la vider.** Avant
  d'écrire `notAnInterfaceString = []`, mesurer : 0 autre clé symbolique du
  catalogue ne manque son français. Sans cette mesure, vider l'exception était un
  pari à 30 minutes de CI.
