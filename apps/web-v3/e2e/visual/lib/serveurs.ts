import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AddressInfo, createServer as createSocketServer } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { franchissementsReseau, mesurePage } from '../../../scripts/mesure-reseau.d.mts';

/**
 * Les deux serveurs que mesure la suite réseau — et la raison pour laquelle
 * elle en monte DEUX.
 *
 * Le livrable de `/l/:token` n'est pas une page : c'est un ORDRE d'appels
 * (résoudre, répondre, PUIS compter le clic). Un gate qui ne regarderait que le
 * navigateur ne verrait jamais la moitié serveur de cet ordre — c'est
 * exactement le défaut que la conception nomme « un correctif dont la valeur
 * n'atteint aucun lecteur » retourné : ici, la moitié invisible est celle qui
 * porte le critère. La passerelle de bouchon est donc un TÉMOIN, pas une
 * commodité : elle date chaque appel qu'elle reçoit.
 *
 * Elle tourne dans le processus du test, donc son horloge est celle des
 * événements CDP : c'est ce qui rend comparable « la 302 est partie » et « le
 * clic est arrivé ».
 */

/**
 * La racine du paquet, calculée avec `__dirname` et non `import.meta.url`.
 *
 * Playwright transpile ses fichiers en CommonJS : `import.meta` y jette
 * (« Cannot use 'import.meta' outside a module ») et le module entier cesse
 * de se charger — donc la suite entière sort en « aucun test trouvé », c'est-
 * à-dire en VERT sur une machine qui ne mesure rien. Le harnais reste donc en
 * CommonJS, comme le chargeur qui l'exécute.
 */
export const RACINE_V3 = join(__dirname, '..', '..', '..');

export type AppelRecu = {
  readonly methode: string;
  readonly chemin: string;
  readonly a: number;
  readonly corps: string;
};

export type PasserelleDeBouchon = {
  readonly base: string;
  readonly journal: readonly AppelRecu[];
  readonly oublie: () => void;
  readonly ferme: () => Promise<void>;
};

export const NOM_DU_LIEN = 'Équipe Lagos';
export const DESCRIPTION_DU_LIEN = 'Le canal des opérations de terrain.';
/** Servi par l'aperçu, JAMAIS attendu dans le HTML : c'est le témoin de la fuite du § 5.1. */
export const CREATEUR_DU_LIEN = 'ibrahim-le-createur';

const json = (reponse: ServerResponse, corps: unknown): void => {
  reponse.writeHead(200, { 'content-type': 'application/json' });
  reponse.end(JSON.stringify(corps));
};

const corpsDe = async (requete: IncomingMessage): Promise<string> => {
  const morceaux: Buffer[] = [];
  for await (const morceau of requete) morceaux.push(Buffer.from(morceau));
  return Buffer.concat(morceaux).toString('utf8');
};

const portLibre = async (): Promise<number> =>
  new Promise((resoud) => {
    const sonde = createSocketServer();
    sonde.listen(0, '127.0.0.1', () => {
      const { port } = sonde.address() as AddressInfo;
      sonde.close(() => resoud(port));
    });
  });

const ecoute = (serveur: Server, port: number): Promise<void> =>
  new Promise((resoud) => serveur.listen(port, '127.0.0.1', () => resoud()));

/**
 * La passerelle de bouchon : trois routes, celles que `/l/:token` connaît.
 * `cibleActive` permet à un test de fermer le lien sans changer de serveur.
 */
/**
 * TROIS CHAÎNES, PARCE QUE LA PRODUCTION EN PRODUIT TROIS — et une seule d'entre
 * elles bouge les deux portes.
 *
 * Un jeton `/l/:token` est soit un `ConversationShareLink` (invitation), soit un
 * `TrackingLink` (story, réel, post, humeur, lien externe : tout le § P0). Ce
 * sont deux modèles disjoints, et `GET /anonymous/link/:identifier` n'en connaît
 * qu'un : il rend 404 sur un jeton de tracking, TOUJOURS. Un bouchon qui
 * refuserait « des deux côtés » pour tout jeton raconterait donc une chaîne que
 * la production ne produit jamais — et c'est exactement ce qui a laissé passer
 * un écran servant « Indéterminé » à la moitié du produit.
 *
 *   • `refusParJeton` — une INVITATION close : `resolve` la dit `isActive:false`
 *     et l'aperçu NOMME le refus par un 410. Les deux portes parlent.
 *   • `trackingFermeParJeton` — un lien de TRACKING clos : `resolve` le dit
 *     `isActive:false` avec son `expiresAt` (la valeur du dictionnaire), et
 *     l'aperçu rend 404. Une seule porte parle, et c'est la seule qui répond aux
 *     deux familles.
 *   • `inconnus` — un jeton que la passerelle ne trouve pas : les deux portes
 *     rendent 404, et rien ne doit être NOMMÉ (§ 5.1, oracle d'énumération).
 */
const jetonDuChemin = (chemin: string): string =>
  decodeURIComponent(chemin.split('?')[0]?.split('/').filter(Boolean).pop() ?? '');

export const passerelleDeBouchon = async (options?: {
  readonly actif?: boolean;
  readonly refusParJeton?: Readonly<Record<string, string>>;
  /** Jeton de tracking clos → son `expiresAt` ISO, ou `null` s'il n'en a pas. */
  readonly trackingFermeParJeton?: Readonly<Record<string, string | null>>;
  readonly inconnus?: readonly string[];
}): Promise<PasserelleDeBouchon> => {
  const journal: AppelRecu[] = [];
  const actif = options?.actif ?? true;
  const refus = options?.refusParJeton ?? {};
  const tracking = options?.trackingFermeParJeton ?? {};
  const inconnus = options?.inconnus ?? [];
  const introuvable = (reponse: ServerResponse): void => {
    reponse.writeHead(404, { 'content-type': 'application/json' });
    reponse.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
  };

  const serveur = createServer(async (requete, reponse) => {
    const chemin = requete.url ?? '';
    journal.push({
      methode: requete.method ?? 'GET',
      chemin,
      a: Date.now(),
      corps: requete.method === 'POST' ? await corpsDe(requete) : '',
    });

    if (chemin.includes('/resolve')) {
      const jeton = jetonDuChemin(chemin.replace('/resolve', ''));
      if (inconnus.includes(jeton)) {
        introuvable(reponse);
        return;
      }

      const echeance = tracking[jeton];
      if (echeance !== undefined) {
        json(reponse, {
          success: true,
          data: {
            kind: 'tracking',
            targetType: 'STORY',
            targetId: 'story-interne',
            originalUrl: null,
            isActive: false,
            expiresAt: echeance,
          },
        });
        return;
      }

      json(reponse, {
        success: true,
        data: {
          kind: 'conversation',
          targetType: 'CONVERSATION',
          targetId: 'conv-interne',
          originalUrl: null,
          isActive: refus[jeton] === undefined && actif,
          expiresAt: null,
        },
      });
      return;
    }

    if (chemin.includes('/anonymous/link/')) {
      const jeton = jetonDuChemin(chemin);
      // La porte que la production n'ouvre QUE pour une invitation.
      if (inconnus.includes(jeton) || tracking[jeton] !== undefined) {
        introuvable(reponse);
        return;
      }

      const code = refus[jeton];
      if (code !== undefined) {
        reponse.writeHead(410, { 'content-type': 'application/json' });
        reponse.end(JSON.stringify({ success: false, error: code, message: 'refus' }));
        return;
      }

      json(reponse, {
        success: true,
        data: {
          linkId: 'mshy_lagos',
          name: NOM_DU_LIEN,
          description: DESCRIPTION_DU_LIEN,
          creator: { id: 'u1', username: CREATEUR_DU_LIEN, email: `${CREATEUR_DU_LIEN}@example.com` },
          conversation: { id: 'c1', title: NOM_DU_LIEN, description: DESCRIPTION_DU_LIEN },
        },
      });
      return;
    }

    json(reponse, { success: true, data: { clickId: 'clic-1' } });
  });

  const port = await portLibre();
  await ecoute(serveur, port);

  return {
    base: `http://127.0.0.1:${port}`,
    journal,
    oublie: () => {
      journal.length = 0;
    },
    ferme: () => new Promise((resoud) => serveur.close(() => resoud())),
  };
};

export type ServeurV3 = {
  readonly base: string;
  readonly ferme: () => Promise<void>;
};

const attend = async (url: string, jusqua: number): Promise<void> => {
  for (;;) {
    const vivant = await fetch(url)
      .then((r) => r.ok)
      .catch(() => false);
    if (vivant) return;
    if (Date.now() > jusqua) throw new Error(`le serveur de la v3 n'a pas démarré : ${url}`);
    await new Promise((resoud) => setTimeout(resoud, 250));
  }
};

/**
 * Le serveur de la v3, tel que la production le lance — l'artefact de `next
 * build`, pas le mode développement, dont les octets et les requêtes n'ont
 * rien à voir avec ceux du § 8.3.
 *
 * L'absence de build est une ERREUR, jamais un test ignoré : une mesure dont le
 * prérequis manque doit se voir (§ 9.2), et un `skip` la rendrait verte.
 */
export const serveurDeLaV3 = async (passerelle: string): Promise<ServeurV3> => {
  if (!existsSync(join(RACINE_V3, '.next', 'app-build-manifest.json'))) {
    throw new Error("apps/web-v3 n'est pas construit — lancer d'abord `cd apps/web-v3 && bun run build`");
  }

  const port = await portLibre();
  const base = `http://127.0.0.1:${port}`;
  const enfant: ChildProcess = spawn(
    'npx',
    ['next', 'start', '-p', String(port), '-H', '127.0.0.1'],
    {
      cwd: RACINE_V3,
      env: {
        ...process.env,
        MEESHY_GATEWAY_URL: passerelle,
        // L'URL canonique que les OG annoncent : derrière Traefik l'en-tête
        // `Host` interne n'est pas l'origine publique, et une carte d'aperçu
        // est mise en cache PAR URL (§ 5.4).
        NEXT_PUBLIC_FRONTEND_URL: base,
        NODE_ENV: 'production',
      },
      stdio: 'ignore',
    },
  );

  await attend(`${base}/healthz`, Date.now() + 60_000);

  return {
    base,
    ferme: () =>
      new Promise((resoud) => {
        enfant.once('exit', () => resoud());
        enfant.kill('SIGTERM');
      }),
  };
};

/** Le gate de budget, lancé tel que le critère de fin l'écrit. */
export const budgetDeBundle = (): string =>
  execFileSync('node', ['scripts/check-bundle-budget.mjs'], {
    cwd: RACINE_V3,
    encoding: 'utf8',
  });

/**
 * `scripts/mesure-reseau.mjs`, chargé DYNAMIQUEMENT.
 *
 * Playwright transpile ses specs en CommonJS : un `import` statique du module
 * ESM le ferait passer par la même transformation, et `import.meta` y explose
 * (« Cannot use 'import.meta' outside a module »). L'import dynamique d'une URL
 * calculée passe, lui, par le chargeur ESM de Node.
 *
 * Ce détour existe pour ne PAS réécrire l'arithmétique des plafonds dans le
 * spec : la comparaison à `budgets.json` reste au site unique du § 9.2, sans
 * quoi le gate et son rapport diraient un jour deux choses différentes. La MESURE
 * elle-même — session CDP, écoute des trois événements réseau, bloc `VITALS` —
 * y reste aussi : `mesurePage` est projetée ici pour que le spec l'APPELLE, et
 * la seule chose qu'il en surcharge est l'agent (§ `mesurePage`).
 *
 * Les signatures ne sont pas RECOPIÉES mais reprises par `typeof` du fichier de
 * déclarations du module : une projection recopiée est une jumelle qui dérive au
 * premier paramètre ajouté.
 */
export type MesureReseau = {
  readonly mesurePage: typeof mesurePage;
  readonly franchissementsReseau: typeof franchissementsReseau;
};

export const chargeMesureReseau = async (): Promise<MesureReseau> => {
  const url = pathToFileURL(join(RACINE_V3, 'scripts', 'mesure-reseau.mjs')).href;
  return (await import(url)) as unknown as MesureReseau;
};
