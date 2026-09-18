import { readFile as readFileDefault, stat as statDefault } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

/**
 * LE SERVEUR DE `dist` DES GATES, ÉCRIT UNE FOIS — ET QUI NE DÉGUISE PLUS UNE
 * PANNE EN PAGE (#6988).
 *
 * Vingt-neuf gates recopiaient le même serveur mot pour mot, avec cette boucle :
 *
 *     for (const f of [p, `${p}.html`, `${p}/index.html`, 'index.html']) {
 *       try { … return; } catch { /* candidat suivant *\/ }
 *     }
 *
 * Deux défauts qui se composent. Le `catch` avale TOUTE erreur, pas seulement
 * « fichier absent » ; et le dernier candidat est TOUJOURS `index.html`. Une
 * requête `/assets/realtime-xxx.js` dont la lecture échoue reçoit donc
 * `index.html` avec `content-type: text/html` — le navigateur reçoit du HTML là
 * où il attend un module ES, et rend « Failed to fetch dynamically imported
 * module ». Une erreur transitoire devient une erreur déroutante, sans aucune
 * trace au journal.
 *
 * Mesuré : le job « Peaux web-v2 » a rougi TROIS fois en trois heures sur ce
 * motif, sous deux symptômes qui n'avaient pas l'air liés — un
 * `waitForSelector` qui expire (l'écran attendu était lui-même un chunk
 * paresseux) et deux modules introuvables. Les chunks existaient dans le `dist`
 * à chaque fois, et le même gate rendait 268 témoins verts en local.
 *
 * DEUX RÈGLES, et la seconde est celle qui manquait :
 *
 *  1. **Le repli SPA appartient aux ROUTES.** Un chemin qui porte une extension
 *     est une demande de FICHIER : il rend un 404 franc. Un 404 se diagnostique ;
 *     un 200 `text/html` servi pour un `.js` se diagnostique mal, et c'est ce
 *     qui a coûté trois enquêtes.
 *  2. **Seule l'absence passe au candidat suivant.** Toute autre erreur rend un
 *     500 qui NOMME son code, pour que la cause se lise au lieu de se deviner.
 *
 * Même raison d'être que `launchChromium` dans le fichier voisin : une chose
 * écrite à plusieurs endroits finit par être écrite de plusieurs façons, et
 * c'est l'endroit qu'on ne teste pas qui porte la mauvaise.
 *
 * POURQUOI CE FICHIER NE S'APPELLE PAS `dist-server`. `apps/web-v2/.gitignore`
 * ligne 3 porte `dist-*`, pour les sorties de construction des coques
 * (`dist-capacitor`, `dist-gateway`, `dist-app-update-a`). Un fichier nommé
 * `dist-server.mjs` y tombe : `git add` le refuse, et un `git add -f` le
 * suivrait tout en le laissant à la merci d'un `git clean -X`. Le nom dit donc
 * à QUI le serveur sert — les gates — et non ce qu'il sert.
 */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Les fichiers à tenter pour un chemin, dans l'ordre. **Un chemin à extension
 * n'en a qu'UN** : c'est toute la règle. La forme du chemin décide, jamais une
 * liste d'extensions connues — sans quoi le premier format ajouté rouvrirait le
 * défaut en silence.
 */
export const distCandidates = (pathname) => {
  const p = pathname.replace(/^\/+/, '');
  if (extname(p) !== '') return [p];
  return [p, `${p}.html`, join(p, 'index.html'), 'index.html'].filter((c, i, all) => all.indexOf(c) === i);
};

/**
 * Démarre le serveur sur un port libre. Rend `{ base, close, server }`.
 * `readFile`/`stat` sont injectables pour qu'un témoin puisse exercer la
 * branche 500 — une saturation ne se provoque pas à la demande.
 */
/** `/sw.js` et les runtimes Workbox qui l'accompagnent. */
const EST_SERVICE_WORKER = /^\/(sw\.js|workbox-[^/]+\.js|sw-[^/]+\.js)$/;

export const startDistServer = async (dist, { readFile = readFileDefault, stat = statDefault, serviceWorker = true } = {}) => {
  const server = createServer(async (req, res) => {
    const pathname = normalize(new URL(req.url, 'http://x').pathname);
    /* LE PRÉCACHE N'EST PAS GRATUIT (#6988). Le manifeste porte ~240 entrées,
       et un gate ouvre un contexte PAR schéma et PAR gabarit — quatre profils
       isolés, donc quatre installations, donc près d'un millier de requêtes de
       précache qui frappent ce serveur mono-thread EN PLUS des navigations que
       le gate mesure. Sur un runner partagé, c'est la saturation, et elle se
       lit comme un chunk qui n'arrive pas.

       Un gate qui MESURE le service worker le sert (c'est le défaut) ; un gate
       qui mesure des LIENS, une liste ou un fil ne doit pas payer son
       installation. On retire le précache, jamais l'application : la coquille
       et les assets restent servis. */
    if (!serviceWorker && EST_SERVICE_WORKER.test(pathname)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`404 ${pathname} — service worker volontairement non servi (gate sans précache)`);
      return;
    }
    for (const candidate of distCandidates(pathname)) {
      const file = join(dist, candidate);
      try {
        if (!(await stat(file)).isFile()) continue;
        // Le corps est lu AVANT d'écrire l'en-tête : un `writeHead(200)` posé
        // d'abord rend le 500 impossible (`ERR_HTTP_HEADERS_SENT`), et la
        // panne repart alors en réponse 200 tronquée — soit exactement le
        // déguisement que ce fichier existe pour supprimer.
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
        res.end(body);
        return;
      } catch (cause) {
        // Seule l'ABSENCE autorise le candidat suivant. Le reste — saturation
        // de descripteurs, permission, disque — est une panne, et une panne se
        // dit : c'est elle qu'on cherchait pendant trois enquêtes.
        if (cause?.code === 'ENOENT' || cause?.code === 'ENOTDIR') continue;
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`500 ${cause?.code ?? 'ERREUR'} en servant ${candidate} : ${cause?.message ?? cause}`);
        return;
      }
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`404 ${pathname}`);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { server, base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
};
