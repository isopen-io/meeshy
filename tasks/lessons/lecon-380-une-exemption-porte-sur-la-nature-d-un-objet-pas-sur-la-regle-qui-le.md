## Leçon 380 — Une exemption porte sur la NATURE d'un objet, pas sur la règle qui le lit

**Cycle #4328 (2026-09-01).** `LocalizationConsistencyTests.untranslatableKeys`
déclare depuis 225i que les CGU (`onboarding.step.recap.terms.body`) ne se
traduisent pas à l'initiative d'une itération — du texte qu'un utilisateur
ACCEPTE ne se traduit pas à la légère. **Deux règles honoraient cette
déclaration** (`fullyLocalizedScreensStayTranslated…`,
`fullyLocalizedScreenDefaultValuesMatch…`). **Le cliquet du backlog, non** : il
comptait la clé comme une dette ordinaire.

Le symptôme n'est pas un faux rouge, il est plus discret : **le plancher du
plafond valait 1, pour une raison qu'aucun lecteur du nombre ne pouvait voir**.
Un `0` était inatteignable, et rien ne l'aurait jamais expliqué — un cliquet qui
gardera toujours du mou, sans que personne sache combien ni pourquoi.

> La question à poser en ÉCRIVANT une exemption — jamais en lisant le compte :
> **« toutes les lectures de la donnée qu'elle exempte l'honorent-elles ? »**
> C'est la forme jumelle de « quand un correctif enseigne une notion à UN
> lecteur de catalogue, chercher les autres lecteurs » (226i / #4329).

**Et une exemption doit se PAYER.** Une porte qu'on élargit sans rien casser
cesse d'être une porte. `test_lExemptionDesClesIntraduisiblesAUnEffetSurLeCliquet`
mesure le cliquet **deux fois** — `untranslatedKeys(env, honouringExemptions:)` —
et exige que la différence soit **exactement** `untranslatableKeys`. Une entrée
ajoutée « au cas où », ou restée là après que son défaut a disparu, rougit
désormais. C'est la loi « un contrôle existe s'il a un effet », appliquée à une
liste au lieu d'un bouton.

**Corollaire de mesure, payé le même jour** : un plafond se LIT au témoin forcé
à zéro, jamais soustrait du précédent. Le plafond disait 31 ; la mesure rendait
**8**. Les 23 points d'écart étaient du mou qu'une soustraction avait laissé
s'installer — exactement la cause qui avait donné 42 points au cycle 231i.

**Corollaire de découpe** : le fichier hôte passait 1251 lignes, donc était
fermé à tout ajout (budget 800–1100). La ligne de découpe est une
RESPONSABILITÉ — d'un côté les RÈGLES que le dépôt s'engage à tenir, de l'autre
la MESURE qui les alimente (catalogues, arborescence, scanner) : elles bougent
pour des raisons différentes. 965 + 370. `private` étant de portée FICHIER en
Swift, trois statiques s'élargissent en `internal` : le prix de la découpe, à
dire à l'endroit où on le paie.
