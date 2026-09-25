## Leçon 547 — Un renommage qui épargne les chaînes renomme la DÉCLARATION et laisse l'USAGE

**Le contexte.** Directive porteur du 2026-09-07 : le code de `apps/web-v3` (la
v3.1) passe à une nomenclature anglaise. 5 634 lignes, cinq couches à la fois —
fichiers, identifiants, jetons CSS, classes utilitaires, clés JSON. Outillé
plutôt que fait à la main, avec **masquage des commentaires et des chaînes**
pour ne pas mutiler la prose française du dépôt.

**Ce que le masquage a coûté.** Trois défauts, tous produits par le renommage
lui-même, tous invisibles au type-check, tous dans une chaîne :

1. `new RegExp(\`^/(${ROUTES_INSTITUTIONNELLES.join('|')})/$\`)` — la
   déclaration était devenue `INSTITUTIONAL_ROUTES`, l'usage vivait dans une
   **interpolation de gabarit**, masquée avec le reste du littéral. Le service
   worker levait une `ReferenceError` à l'installation. Symptôme : rien à la
   première visite, page blanche à la deuxième.
2. `querySelectorAll('[data-ligne]')` contre un `data-row` dans le JSX. Un
   sélecteur qui ne matche rien ne lève pas : la scène de la Lentille rendait
   une liste inerte, correctement peinte.
3. Le script de thème inline de `index.html` lisait `localStorage['meeshy.schema']`
   et comparait à `'clair'`, pendant que le module écrivait `'light'` sous
   `'meeshy.scheme'`. Un éclair blanc au démarrage à froid, pour le seul
   utilisateur ayant déjà choisi son schéma.

**La règle.** Dans un langage à chaînes, **la moitié des références d'un nom ne
sont pas des identifiants** : sélecteurs CSS et DOM, clés de stockage, clés
JSON, noms de classes, chemins d'import, interpolations. Un renommage qui les
masque pour protéger la prose protège aussi les usages. La question à poser
n'est donc pas « ai-je renommé toutes les déclarations ? » mais **« qui NOMME
cette chose sans être du code ? »** — et la réponse se cherche par usage
(`querySelector`, `getItem`, `className`, `import`, `${`), jamais par symbole.

**Ce qui les a attrapés — et ce qui ne l'a pas fait.** Ni `tsc`, ni les 33
tests unitaires, ni le build. Les deux premiers sont tombés sur les témoins de
NAVIGATEUR (`check-institutional.mjs`, `check-lens.mjs`), qui exercent une
deuxième visite et un vrai défilement. Le troisième n'a été trouvé qu'à la
relecture : **aucun témoin ne couvre le script de thème inline** — c'est un
suivi déclaré, pas une case verte.

**Le quatrième cas, qu'aucun outil ne signale.** Une classe Tailwind qui ne
correspond à aucun jeton n'émet **aucune règle** : pas d'erreur, pas
d'avertissement, l'élément se peint par défaut. Un renommage de jetons en
fabrique en série. Le témoin qui ferme ça (`check-utilities.mjs`) n'oppose pas
les classes du source à une liste de jetons déclarés — il faudrait tenir à la
main les utilitaires natifs de Tailwind, qui dérivent à chaque version — mais
**à la feuille produite** : le compilateur n'émet que ce qu'il a reconnu, donc
une classe absente du CSS construit est morte, quelle qu'en soit la cause.
**Quand la liste de référence dérive plus vite que le code, mesurer la SORTIE
plutôt que la configuration.**

**Corollaire de méthode.** Sa première version coupait le jeton au premier `:`
pour ôter la variante, et signalait `placeholder:text-ios-ink-3` et
`sm:grid-cols-2` — deux classes parfaitement vivantes, dont le sélecteur émis
PORTE la variante. Un gate qui rend des faux positifs le jour de sa naissance
sera désarmé le jour où il rendra un vrai.
