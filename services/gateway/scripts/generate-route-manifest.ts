/**
 * Régénère `route-manifest.json` — l'artefact commité que le cliquet
 * `src/__tests__/security/route-manifest-ratchet.test.ts` compare à une
 * régénération fraîche (#4276, critère 2).
 *
 * Usage (une commande, sans argument) :
 *   npm run route-manifest:generate
 *   # ou, équivalent : npx tsx scripts/generate-route-manifest.ts
 *
 * ## Pourquoi ce script fixe deux variables d'environnement AVANT tout import
 *
 * `registerAllRoutes` (via `routes/uploads/tus-handler.ts`) lit `UPLOAD_PATH`
 * une seule fois, au CHARGEMENT du module (`const UPLOAD_PATH = process.env.
 * UPLOAD_PATH || '/app/uploads'`), et y crée un sous-dossier au démarrage des
 * routes. Le défaut de production (`/app/uploads`) n'existe pas dans ce poste
 * — exactement la raison pour laquelle `jest.setup.js` pose la même variable
 * pour les tests. Et `AttachmentEncryptionService.getMasterKey()` EXIGE
 * `ATTACHMENT_MASTER_KEY` sauf si `NODE_ENV === 'test'`, auquel cas elle
 * retombe sur une clé déterministe de test — la même bascule dont
 * `jest.setup.js` profite déjà, réutilisée ici plutôt que d'inventer une
 * troisième convention pour ce script.
 *
 * Ces deux lectures ont lieu au CHARGEMENT (import) de `route-registration.ts`
 * et de ses dépendances — un `import` statique serait HISSÉ par le
 * compilateur au-dessus de toute affectation `process.env...` écrite plus
 * haut dans ce fichier, quel que soit l'ordre textuel. D'où l'`import()`
 * DYNAMIQUE ci-dessous, qui s'exécute au point où il apparaît : c'est ce qui
 * garantit que les variables sont posées AVANT que quoi que ce soit ne les
 * lise.
 *
 * ## Pourquoi `process.exit(0)` explicite en sortie
 *
 * Le serveur assemblé ouvre un VRAI client ZMQ (`ZMQSingleton`,
 * `voice-profile.ts`/`voice-analysis.ts`) — mesuré : `.connect()` résout en
 * quelques millisecondes même sans pair à l'écoute (sémantique ZMQ : la
 * connexion ne bloque pas sur la présence d'un auditeur), mais le socket reste
 * un handle OUVERT que Node n'a aucune raison de fermer tout seul. Ce script
 * n'a besoin d'aucune fermeture propre — il écrit un fichier et s'arrête —
 * donc il force la sortie plutôt que d'attendre un drain d'event loop qui ne
 * viendrait jamais.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

async function main(): Promise<void> {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.UPLOAD_PATH = process.env.UPLOAD_PATH || path.join(os.tmpdir(), 'meeshy-route-manifest-uploads');
  process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'meeshy-route-manifest-sounds');

  const { buildRouteManifest } = await import('../src/route-manifest');
  const artifact = await buildRouteManifest();

  const outPath = path.join(__dirname, '..', 'route-manifest.json');
  fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  const nonV1 = artifact.routes.filter((route) => !route.path.startsWith('/api/v1'));
  const emptyPrefix = artifact.routes.filter((route) => route.mountPrefix === '');
  console.log(`✓ ${artifact.routeCount} routes écrites dans ${outPath}`);
  console.log(`  dont ${nonV1.length} hors de /api/v1, et ${emptyPrefix.length} sans préfixe d'enregistrement (mountPrefix vide — candidates du critère 4).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Échec de génération de route-manifest.json :', error);
    process.exit(1);
  });
