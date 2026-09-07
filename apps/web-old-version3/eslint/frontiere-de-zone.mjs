// LA FRONTIÈRE DE ZONE, RENDUE OPPOSABLE (§ 3.2 corollaire 4, § 4.9).
//
// Entre les étapes 2 et 4 du § 4.9, `/l` est en v3 et `/chats` encore en legacy : un utilisateur
// franchit une frontière de zone. Même origine ⇒ cookie et `localStorage` suivent ; mais la
// navigation client de Next NE TRAVERSE PAS une zone. Un `<Link>` vers l'autre côté ne charge
// rien : il pousse une entrée d'historique et le routeur de la v3 rend son 404.
//
// D'où DEUX règles, et une ASYMÉTRIE de sévérité qui n'est pas une timidité :
//
//   • `lien-sortant-en-navigation-client` — ERREUR. Un `<Link>` hors périmètre est CASSÉ. Le
//     défaut est silencieux (aucune requête, aucune trace serveur) et ne se voit qu'au clic.
//
//   • `lien-interne-en-rechargement` — SIGNALÉ. Un `<a>` vers une route que la v3 sert déjà
//     FONCTIONNE : il recharge le document là où `<Link>` naviguerait côté client. C'est une
//     lenteur, pas une casse — et surtout, le retour arrière du § 4.3 (retirer un `PathPrefix`,
//     `docker compose up -d` sans rebuild) le rendrait de nouveau NÉCESSAIRE. En faire une
//     erreur reviendrait à exiger un commit de code pour revenir en arrière sur une opération
//     qui, par construction, n'en demande aucun.
//
// CE QUE CES RÈGLES NE VOIENT PAS, et il faut le dire plutôt que de le laisser croire :
//   – un `href` calculé (`<Link href={route}>`) : rien de statique à juger ;
//   – un gabarit dont la partie fixe s'arrête au milieu d'un segment (`` `/l${x}` `` — `/login`
//     ou `/l/abc` ?) : jugé seulement si la partie fixe finit sur un séparateur ;
//   – une URL absolue vers sa propre origine (`https://meeshy.me/settings`) : elle échappe au
//     périmètre par sa forme, pas par sa cible. Ce n'est pas une route de l'origine COURANTE ;
//   – un lien composé en CHAÎNE HTML, et c'est le seul angle mort qui touche du code ÉCRIT :
//     le rôle premier (`app/(public)/l/[token]/`) est un Route Handler qui assemble son document
//     à la main (`document.ts` → `` `<a class="…" href="${echappe(action.href)}">` ``). Aucun
//     `JSXOpeningElement` n'y est visité, donc ces deux règles n'ont AUCUNE prise sur la seule
//     surface que la v3 sert aujourd'hui. Ce n'est pas une faille de la frontière — un document
//     composé côté serveur n'a pas de routeur client, donc son `<a>` est toujours la forme
//     JUSTE —, mais la garantie du § 3.2 corollaire 4 ne couvre PAS cet idiome, et le dire
//     valait mieux que de le laisser croire. Ce qui la rend opposable là : le témoin
//     `__tests__/liens-du-role-premier.test.ts`, qui énumère les `href` littéraux de la surface
//     et les oppose au MÊME périmètre.

import { cheminDOrigine, servieParLaV3 } from '../scripts/lib/perimetre-de-zone.mjs';

// Le périmètre est une liste de RÉCLAMATIONS Traefik (`{matcher, valeur}`), pas de chaînes : un
// `Path(`/`)` et un `PathPrefix(`/`)` ne réclament pas la même chose, et écraser la distinction
// ici la perdrait pour toujours. `minItems: 0` n'est pas une tolérance : à l'étape 1 du § 4.9 la
// v3 ne sert AUCUNE route humaine (seuls ses bundles sont joignables), donc le périmètre de
// navigation est légitimement VIDE — et c'est la lecture juste, celle qui fait de tout `<Link>`
// une erreur et d'aucun `<a>` un reproche.
const SCHEMA = [
  {
    type: 'object',
    properties: {
      perimetre: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            matcher: { enum: ['Path', 'PathPrefix'] },
            valeur: { type: 'string' },
          },
          required: ['matcher', 'valeur'],
          additionalProperties: false,
        },
        minItems: 0,
      },
    },
    required: ['perimetre'],
    additionalProperties: false,
  },
];

const perimetreDe = (context) => context.options[0].perimetre;

const enClair = (perimetre) =>
  perimetre.length === 0
    ? 'aucune route humaine, étape 1 du § 4.9'
    : perimetre.map(({ valeur }) => valeur).join(', ');

const attribut = (element, nom) =>
  element.attributes.find(
    (candidat) => candidat.type === 'JSXAttribute' && candidat.name.name === nom,
  );

// La partie STATIQUE d'un `href`, ou `null` quand il n'y en a pas d'exploitable.
const cibleStatique = (valeur) => {
  if (valeur === undefined || valeur === null) return null;
  if (valeur.type === 'Literal') return typeof valeur.value === 'string' ? valeur.value : null;
  if (valeur.type !== 'JSXExpressionContainer') return null;

  const expression = valeur.expression;
  if (expression.type === 'Literal') {
    return typeof expression.value === 'string' ? expression.value : null;
  }
  if (expression.type !== 'TemplateLiteral') return null;

  const [tete] = expression.quasis;
  if (tete === undefined || typeof tete.value.cooked !== 'string') return null;
  if (expression.expressions.length === 0) return tete.value.cooked;

  return tete.value.cooked.endsWith('/') ? tete.value.cooked : null;
};

const cheminVise = (element) => cheminDOrigine(cibleStatique(attribut(element, 'href')?.value));

const nomDeLaBalise = (element) =>
  element.name.type === 'JSXIdentifier' ? element.name.name : null;

// `next/link` n'expose que son défaut. On suit le nom LOCAL plutôt que la chaîne « Link » : un
// `import Lien from 'next/link'` est le même composant, et une règle qui ne verrait que « Link »
// laisserait passer le renommage — la forme exacte qu'un contournement prendrait.
const liensDeNext = (visiteur) => {
  const locaux = new Set();
  return {
    ImportDeclaration(node) {
      if (node.source.value !== 'next/link') return;
      node.specifiers
        .filter((specifier) => specifier.type === 'ImportDefaultSpecifier')
        .forEach((specifier) => locaux.add(specifier.local.name));
    },
    JSXOpeningElement(node) {
      visiteur(node, locaux);
    },
  };
};

const lienSortantEnNavigationClient = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "un <Link> vers une route que la v3 ne sert pas : la navigation client de Next ne " +
        'traverse pas une frontière de zone',
    },
    schema: SCHEMA,
    messages: {
      sortant:
        "`{{cible}}` sort du périmètre servi par la v3 ({{perimetre}}) : la navigation client de " +
        "Next ne traverse pas une frontière de zone, donc ce `<{{balise}}>` n'atteindrait jamais " +
        "le legacy — il pousserait une entrée d'historique et rendrait le 404 de la v3. Un lien " +
        'qui franchit la zone est un `<a href>` réel (§ 3.2 corollaire 4, § 4.9).',
    },
  },
  create(context) {
    const perimetre = perimetreDe(context);

    return liensDeNext((node, locaux) => {
      const balise = nomDeLaBalise(node);
      if (balise === null || !locaux.has(balise)) return;

      const cible = cheminVise(node);
      if (cible === null || servieParLaV3(cible, perimetre)) return;

      context.report({
        node,
        messageId: 'sortant',
        data: { cible, balise, perimetre: enClair(perimetre) },
      });
    });
  },
};

const lienInterneEnRechargement = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'un <a href> vers une route que la v3 sert déjà : il recharge le document là où la ' +
        'navigation client suffirait',
    },
    schema: SCHEMA,
    messages: {
      interne:
        '`{{cible}}` est DÉJÀ servie par la v3 ({{perimetre}}) : ce `<a href>` recharge tout le ' +
        'document là où `<Link>` naviguerait côté client. Signalé, jamais refusé — un `<a>` reste ' +
        'correct, et le retour arrière du § 4.3 (retirer le `PathPrefix`, sans rebuild) le ' +
        'rendrait de nouveau nécessaire.',
    },
  },
  create(context) {
    const perimetre = perimetreDe(context);

    return {
      JSXOpeningElement(node) {
        if (nomDeLaBalise(node) !== 'a') return;

        const cible = cheminVise(node);
        if (cible === null || !servieParLaV3(cible, perimetre)) return;

        context.report({
          node,
          messageId: 'interne',
          data: { cible, perimetre: enClair(perimetre) },
        });
      },
    };
  },
};

export const frontiereDeZone = {
  meta: { name: 'zone' },
  rules: {
    'lien-sortant-en-navigation-client': lienSortantEnNavigationClient,
    'lien-interne-en-rechargement': lienInterneEnRechargement,
  },
};
