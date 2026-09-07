// Le HTTPS de dév de la zone v3 — quel CERTIFICAT le serveur présente vraiment
//
// POURQUOI CE SCRIPT EXISTE PLUTÔT QU'UN `--experimental-https` NU
//
// `next dev --experimental-https` sans argument FABRIQUE un certificat
// auto-signé et le pose dans `apps/web-v3/certificates/`. Mesuré sur celui que
// la première écriture du lot a produit :
//
//   openssl x509 -in apps/web-v3/certificates/localhost.pem -noout -text
//   → X509v3 Subject Alternative Name:
//       DNS:localhost, IP Address:127.0.0.1, IP Address:0:0:0:0:0:0:0:1
//
// RIEN d'autre. Or les trois bannières du `Makefile` qui ouvrent cette zone
// annoncent `https://meeshy.local:3300`, `https://$(HOST):3300` et
// `https://meeshy.local:3300`, et la fenêtre tmux elle-même dit
// « Web v3 HTTPS (meeshy.local -> :3300) » : à l'adresse ANNONCÉE, le serveur
// présentait un certificat qui ne la couvre pas — interstitiel de nom invalide.
// Une fenêtre qui s'ouvre n'est pas une fenêtre FONCTIONNELLE.
//
// POURQUOI LE CERTIFICAT VIENT DE `infrastructure/docker/compose/certs/`
//
// Le dépôt POSSÈDE déjà le certificat qu'il faut : `make setup-certs` →
// `_generate-certs` le génère avec mkcert pour `*.meeshy.local`, `meeshy.local`,
// `*.meeshy.home`, `$(HOST_IP)`, `localhost`, `127.0.0.1`, `::1`, puis le copie
// sous `$(CERTS_DIR)` (`infrastructure/docker/compose/certs/{cert,key}.pem`),
// d'où Traefik le sert déjà. C'est l'emplacement PARTAGÉ, hors des deux zones :
// le consommer ici n'ajoute aucune autorité locale à faire confiance et ne
// duplique aucun secret. Fabriquer une seconde CA plus pauvre à côté de celle
// que le dépôt fait déjà installer était le défaut, pas la solution.
//
// `apps/web` fait encore l'inverse (`next dev -p 3100 --experimental-https` nu,
// donc sa propre CA pour une bannière qui annonce `meeshy.local`) : c'est du
// legacy, que la conception v3 interdit de toucher sans mandat, et c'est porté
// par l'issue #4479 — pas laissé en silence.
//
// POURQUOI LE REPLI RESTE, ET POURQUOI IL PARLE
//
// Un clone neuf n'a pas encore joué `make setup-certs`, et faire échouer
// `dev:https` fermerait la zone à qui veut juste l'ouvrir sur `localhost`. Le
// repli garde donc `--experimental-https` — mais il DIT ce qu'il coûte : à
// cette adresse-là seulement, et `https://meeshy.local:3300` refusera. Un repli
// muet réinstallerait exactement la bannière qui ment.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHARED_CERTIFICATE = 'infrastructure/docker/compose/certs/cert.pem';
export const SHARED_KEY = 'infrastructure/docker/compose/certs/key.pem';

export const SHARED_CERT_NOTICE =
  `HTTPS servi par le certificat partagé du dépôt (${SHARED_CERTIFICATE}) : ` +
  'https://meeshy.local:3300 et https://localhost:3300 sont tous deux valides.';

export const SELF_SIGNED_FALLBACK =
  `certificat partagé absent (${SHARED_CERTIFICATE}) — repli sur le certificat auto-signé de Next, ` +
  'qui ne couvre QUE localhost / 127.0.0.1 / ::1. https://meeshy.local:3300, annoncé par les ' +
  'bannières du Makefile, affichera un nom invalide. Le combler : make setup-certs';

// `--experimental-https` reste TOUJOURS là : c'est lui qui allume TLS. Mesuré —
// passer seulement `--experimental-https-key` / `--experimental-https-cert` fait
// démarrer Next 15.5.23 en CLAIR, et sa bannière annonce alors `http://…` sans
// que rien ne signale l'erreur. Les deux chemins d'accès aux fichiers ne sont
// que le choix du certificat ; le drapeau est le commutateur.
export const planDevHttps = ({ nextArgs, certificate, key, exists }) => {
  const shared = exists(certificate) && exists(key);
  return {
    args: [
      'dev',
      ...nextArgs,
      '--experimental-https',
      ...(shared ? ['--experimental-https-key', key, '--experimental-https-cert', certificate] : []),
    ],
    servesLocalDomain: shared,
    notice: shared ? SHARED_CERT_NOTICE : SELF_SIGNED_FALLBACK,
  };
};

const main = () => {
  const zone = join(dirname(fileURLToPath(import.meta.url)), '..');
  const repository = join(zone, '..', '..');
  const plan = planDevHttps({
    nextArgs: process.argv.slice(2),
    certificate: join(repository, ...SHARED_CERTIFICATE.split('/')),
    key: join(repository, ...SHARED_KEY.split('/')),
    exists: existsSync,
  });

  process.stdout.write(`${plan.servesLocalDomain ? '✓' : '!'} ${plan.notice}\n`);

  const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
  const child = spawn(process.execPath, [next, ...plan.args], { stdio: 'inherit' });
  child.on('exit', (code, signal) => process.exit(signal === null ? (code ?? 0) : 1));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
