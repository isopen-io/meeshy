/**
 * @jest-environment node
 */

/**
 * CHAQUE ROUTE EST APPELÉE COMME APP ROUTER L'APPELLE — deux arguments,
 * `(requete, { params })` — et doit RENDRE UNE RÉPONSE, jamais rejeter.
 *
 * LE DÉFAUT QUE CE FICHIER GARDE ne peut apparaître dans aucun autre témoin :
 * les portes prennent `(requete, recuperer?)` pour la couture des tests, et
 * App Router pose son objet `{ params }` en DEUXIÈME argument sur toute route,
 * segment dynamique ou non. Une porte ASSIGNÉE NUE (`export const GET =
 * LA_PORTE`) reçoit donc `{ params }` dans `recuperer` — qui GAGNE sur
 * l'option depuis que `serviteurDe` accepte le récupérateur de l'appelant
 * (e62ef97e89) — et la première demande l'APPELLE comme un `fetch` :
 * `TypeError: (c ?? …) is not a function`, 500 en production, INVISIBLE en
 * jsdom parce que les témoins appellent les portes avec leur signature à eux.
 * Mesuré deux fois : `/feed` (#5031, doc-comment de sa route) puis `/chats`
 * (#5079, attrapé sur staging le 2026-09-04).
 *
 * LE POISON EST L'OBJET `{ params }` LUI-MÊME : s'il atterrit dans un
 * paramètre de fonction et se fait appeler, la route rejette — c'est
 * exactement ce que ce témoin interdit. Un jeton est présenté pour dépasser
 * la garde d'authentification : sans lui, une route connectée répond 302
 * AVANT de toucher sa couture, et le poison ne serait jamais consommé.
 * Aucune passerelle n'écoute pendant le test : chaque demande réseau échoue
 * et doit être AVALÉE par la porte (c'est la règle « un silence dessine la
 * panne ») — une réponse 503 est un PASSAGE, un rejet est un échec.
 */

/**
 * `after()` exige la portée de requête du VRAI serveur Next — absente sous
 * jest. Il est remplacé par un appel direct : ce que la planification diffère
 * en production s'exécute inline ici, et le rejet éventuel du travail différé
 * ferait échouer le témoin au lieu de disparaître.
 */
jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  after: (travail: unknown) => {
    if (typeof travail === 'function') void (travail as () => unknown)();
  },
}));

import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const RACINE = join(__dirname, '..', 'app');

const routes = (dossier: string): readonly string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) return routes(chemin);
    return entree.name === 'route.ts' ? [chemin] : [];
  });

const FICHIERS = routes(RACINE);

/** Les valeurs que les segments dynamiques du dépôt attendent. */
const PARAMS = { lien: 'mshy_x', cle: '68f2a81417a557e8ce4ddfc1', id: '68f2a81417a557e8ce4ddfc1', token: 'mshy_x', nom: 'sonde' };

const requeteDe = (fichier: string, methode: string): Request => {
  const segment = relative(RACINE, fichier)
    .replace(/route\.ts$/, '')
    .replace(/\(.*?\)\//g, '')
    .replace(/\[(\w+)\]/g, (_, nom: string) => PARAMS[nom as keyof typeof PARAMS] ?? 'x')
    .replace(/\/+$/, '');
  return new Request(`https://meeshy.test/${segment}`, {
    method: methode,
    headers: {
      cookie: 'meeshy_auth=jeton-de-test; meeshy_session=%7B%22role%22%3A%22USER%22%7D',
      'content-type': 'application/x-www-form-urlencoded',
      'sec-fetch-site': 'same-origin',
    },
    ...(methode === 'POST' ? { body: 'sonde=1' } : {}),
  });
};

describe.each(FICHIERS.map((fichier) => [relative(RACINE, fichier), fichier] as const))(
  'app/%s',
  (_nom, fichier) => {
    for (const methode of ['GET', 'POST'] as const) {
      it(`${methode} appelé avec (requete, { params }) rend une Response — jamais un rejet`, async () => {
        const module_ = (await import(fichier)) as Record<string, unknown>;
        const gestionnaire = module_[methode];
        if (typeof gestionnaire !== 'function') return;

        const contexte = { params: Promise.resolve(PARAMS) };
        const reponse = await (gestionnaire as (r: Request, c: unknown) => Promise<Response>)(
          requeteDe(fichier, methode),
          contexte,
        );

        expect(reponse).toBeInstanceOf(Response);
      });
    }
  },
);
