#!/usr/bin/env node
// LA VOIE DE PARITÉ : les tests qui lisent HORS de leur zone, rejoués à chaque poussée (#12558).
//
// « Tests · web » et « Tests · gateway » ne se sautent par zone que si chacun de leurs tests
// ne lit que sa zone (web : apps/web, packages/shared, packages/design-tokens ; passerelle :
// services/gateway, packages/shared). Une centaine ne le font pas : la passerelle lit le Swift
// des appels et le Kotlin de la signalisation (contrat d'événements), tout `apps/ios/Meeshy`
// (défauts consentis), les compose d'`infrastructure/`, `CLAUDE.md` et les journaux ; le web
// lit des sources de la passerelle et du traducteur, les catalogues et images d'iOS, le
// manifeste Android. Inventaire du 2026-10-24 : 17 tests web, 31 tests passerelle.
//
// Ces tests restent où ils sont — la couverture de la passerelle n'y perd rien — et cette voie
// les REJOUE toujours, que la zone de leur suite soit touchée ou non. Leur liste n'est pas
// tenue à la main : elle se DÉRIVE du texte de chaque test (une racine hors zone citée ET un
// appel qui lit le disque, lance un processus ou importe un module). L'heuristique prend
// large exprès : un test pris en trop coûte quelques secondes dans la voie, un test oublié
// laisserait passer une rupture de parité quand la suite est sautée. `--self-test` vérifie
// qu'elle couvre l'inventaire mesuré, test par test.
//
// Usage :
//   node scripts/ci/voie-parite.mjs --liste web       # chemins relatifs à apps/web, préfixés ./
//   node scripts/ci/voie-parite.mjs --liste gateway   # chemins relatifs à services/gateway
//   node scripts/ci/voie-parite.mjs --self-test

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const LIT = /from ['"`][^'"`]*\.\.\/(services|apps|packages\/MeeshySDK|infrastructure)\/|readFileSync|readdirSync|existsSync|statSync|execFileSync|execSync|spawn|Bun\.file|createRequire|import\(/;

export const SUITES = {
  web: {
    repertoire: 'apps/web',
    fichiers: ['src/*.test.ts', 'src/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/*.test.ts', 'scripts/**/*.test.ts'],
    horsZone: /from ['"`][^'"`]*\.\.\/(services|apps)\/|apps\/(ios|android)|MeeshySDK|services\/|infrastructure|\.github|tasks\/|['"`](ios|android|services|infrastructure|tasks)['"`]|(['"`]\.\.['"`]\s*,\s*){2}['"`]\.\.['"`]|\.\.\/\.\.\/\.\.|createRequire|\.\.\/\.\.\/scripts\//,
  },
  gateway: {
    repertoire: 'services/gateway',
    fichiers: ['src/*.test.ts', 'src/**/*.test.ts'],
    horsZone: /['"`](\.\.\/){3,}\.\.['"`]|apps\/(ios|android|web)\/|MeeshySDK|services\/(translator|agent)\/|infrastructure\/|\.github\/|tasks\/lessons|scripts\/(preuves|maintenance)\/|CLAUDE\.md|['"`](apps|infrastructure|tasks|\.github)['"`]|['"`]git['"`]\s*,\s*\[|(['"`]\.\.['"`]\s*,\s*){3}/,
  },
};

export const litHorsZone = (suite, texte) => SUITES[suite].horsZone.test(texte) && LIT.test(texte);

export const testsDeParite = (suite) => {
  const { repertoire, fichiers } = SUITES[suite];
  const suivis = execFileSync('git', ['ls-files', '--', ...fichiers], { cwd: join(RACINE, repertoire), encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  return [...new Set(suivis)].filter((f) => litHorsZone(suite, readFileSync(join(RACINE, repertoire, f), 'utf8'))).sort();
};

const INVENTAIRE = {
  web: [
    'scripts/brand-assets.test.ts',
    'src/lib/game/ios-catalog-parity.test.ts',
    'src/lib/lottie/real-engine.test.ts',
    'src/lib/links/email-link-secret.test.ts',
    'src/android-silent-channel.test.ts',
    'src/lib/capture/capture-ledger.test.ts',
    'src/lib/admin/broadcast-list.test.ts',
    'src/lib/admin/audit-vocabulary.test.ts',
    'src/lib/admin/audit-list.test.ts',
    'src/lib/send/forward-refusal.test.ts',
    'src/lib/api/realtime-attachment-protection.test.tsx',
    'src/lib/device-translation/generation-budget.test.ts',
    'src/lib/device-translation/nllb-codes.test.ts',
    'src/institutional/privacy.test.ts',
    'src/share-preview/share-preview.test.ts',
    'src/gate-ci-parity.test.ts',
    'src/landing/landing-static.test.ts',
  ],
  gateway: [
    'src/__tests__/unit/socketio/CallEventsHandler-cross-platform-event-contract.test.ts',
    'src/__tests__/unit/services/consent-gated-defaults-invariant.test.ts',
    'src/__tests__/journal-one-file-per-entry-guard.test.ts',
    'src/__tests__/security/claude-md-paths-exist-guard.test.ts',
    'src/__tests__/security/no-callerless-email-guard.test.ts',
    'src/__tests__/repo-scripts-testpathpatterns-guard.test.ts',
    'src/__tests__/security/route-auth-coverage.test.ts',
    'src/__tests__/lessons-numbering-single-key-guard.test.ts',
    'src/__tests__/security/proof-scripts-orphan-sender-guard.test.ts',
    'src/__tests__/security/orphan-participants-script-guard.test.ts',
    ...[
      'access-logs-retained-without-secrets', 'admin-ui-ssh-tunnel-only', 'agent-host-set-wherever-the-agent-runs',
      'agent-internal-only', 'backup-status-mount-read-only', 'cors-origins', 'exact-read-tracking-armed-on-deploy',
      'link-unfurl-bots-routed-to-gateway', 'media-bucket-never-public', 'media-uploads-never-public', 'ops-relay-mounts',
      'pack-samples-staging-only', 'promote-production-gateway-agent-couple', 'signed-file-addresses-out-of-access-logs',
      'sounds-volume-never-public', 'staging-admin-surfaces-ssh-tunnel-only', 'staging-autoheal-isolation',
      'staging-turn-over-443', 'static-nginx-config-per-environment', 'traefik-routed-service-declares-network',
      'viewer-activity-disclosure', 'world-seed-off-in-production',
    ].map((nom) => `src/__tests__/unit/config/${nom}.test.ts`),
  ],
};

const autoTest = () => {
  for (const suite of Object.keys(SUITES)) {
    const voie = new Set(testsDeParite(suite));
    const manquants = INVENTAIRE[suite].filter((f) => !voie.has(f));
    assert.deepEqual(manquants, [], `${suite} : tests hors zone absents de la voie — ${manquants.join(', ')}`);
    const total = execFileSync('git', ['ls-files', '--', ...SUITES[suite].fichiers], { cwd: join(RACINE, SUITES[suite].repertoire), encoding: 'utf8' }).split('\n').filter(Boolean).length;
    assert.ok(voie.size < total / 4, `${suite} : ${voie.size} tests sur ${total} dans la voie — l'heuristique a cessé de trier`);
  }
  assert.equal(litHorsZone('gateway', "const RACINE = join(__dirname, '..', '..', '..', '..');\nreaddirSync(RACINE)"), true);
  assert.equal(litHorsZone('gateway', "import { x } from '../../../../packages/shared/types';"), false);
  assert.equal(litHorsZone('gateway', "// voir apps/ios/Meeshy, rien n'est lu ici"), false);
  assert.equal(litHorsZone('web', "readFileSync(join(APP, '..', '..', 'services', 'gateway', 'src', 'x.ts'))"), true);
  assert.equal(litHorsZone('web', "import { s } from '../../../../services/gateway/src/socketio/x';"), true);
  assert.equal(litHorsZone('web', "import { s } from '@/lib/api/x';\nreadFileSync('./fixture.json')"), false);
  console.log(`voie-parite --self-test : inventaire couvert (${INVENTAIRE.web.length} web, ${INVENTAIRE.gateway.length} passerelle), 6 cas tenus`);
};

const main = () => {
  if (process.argv.includes('--self-test')) return autoTest();
  const i = process.argv.indexOf('--liste');
  const suite = i === -1 ? undefined : process.argv[i + 1];
  if (suite === undefined || SUITES[suite] === undefined) {
    console.error(`usage : node scripts/ci/voie-parite.mjs --liste ${Object.keys(SUITES).join('|')}`);
    process.exit(2);
  }
  for (const f of testsDeParite(suite)) console.log(`./${f}`);
};

if (import.meta.url === `file://${process.argv[1]}`) main();
