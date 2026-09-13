// Le HTTPS de dév de `apps/web` — quel CERTIFICAT le serveur présente vraiment
//
// POURQUOI CE SCRIPT EXISTE PLUTÔT QU'UN `--experimental-https` NU (#4479)
//
// `next dev -p 3100 --experimental-https` sans argument FABRIQUE un certificat
// auto-signé et le pose dans `apps/web/certificates/`, couvrant seulement
// `DNS:localhost, IP:127.0.0.1, IP:::1`. Or le `Makefile` annonce
// `https://meeshy.local` et `https://meeshy.local:3100` : à l'adresse
// ANNONCÉE, le serveur présentait un certificat qui ne la couvre pas —
// interstitiel de nom invalide, et une seconde autorité locale à accepter en
// plus de celle que `make setup-certs` installe déjà.
//
// POURQUOI LE CERTIFICAT VIENT DE `infrastructure/docker/compose/certs/`
//
// Le dépôt POSSÈDE déjà le certificat qu'il faut : `make setup-certs` →
// `_generate-certs` le génère avec mkcert pour `*.meeshy.local`, `meeshy.local`,
// `*.meeshy.home`, `$(HOST_IP)`, `localhost`, `127.0.0.1`, `::1`, et le copie
// sous `$(CERTS_DIR)` (`infrastructure/docker/compose/certs/{cert,key}.pem`),
// d'où Traefik le sert déjà. C'est l'emplacement PARTAGÉ, hors des
// applications web : le consommer ici n'ajoute aucune autorité locale à
// faire confiance et ne duplique aucun secret.
//
// CE QUE CE FICHIER NE TOUCHE PAS
//
// `apps/web/.cert/` reste généré par `make setup-certs` : la passerelle
// (`services/gateway/src/server.ts`) lit un chemin CODÉ EN DUR vers ce
// dossier pour son propre serveur HTTPS en mode `USE_HTTPS=true` — ce n'est
// pas un artefact inerte, seul `apps/web` (Next.js) ne le consommait pas pour
// LUI-MÊME. Ce script ne déplace donc pas la source du certificat : il fait
// consommer à `next dev` le fichier PARTAGÉ que Traefik sert déjà, sans rien
// changer à ce que la passerelle lit.
//
// POURQUOI LE REPLI RESTE, ET POURQUOI IL PARLE
//
// Un clone neuf n'a pas encore joué `make setup-certs`. Faire échouer
// `dev:https` fermerait la zone à qui veut juste l'ouvrir sur `localhost`. Le
// repli garde donc `--experimental-https` seul — mais il DIT ce qu'il coûte :
// à cette adresse-là seulement, et `https://meeshy.local:3100` refusera. Un
// repli muet réinstallerait exactement la bannière qui ment.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHARED_CERTIFICATE = 'infrastructure/docker/compose/certs/cert.pem';
export const SHARED_KEY = 'infrastructure/docker/compose/certs/key.pem';

export const SHARED_CERT_NOTICE =
  `HTTPS servi par le certificat partagé du dépôt (${SHARED_CERTIFICATE}) : ` +
  'https://meeshy.local:3100 et https://localhost:3100 sont tous deux valides.';

export const SELF_SIGNED_FALLBACK =
  `certificat partagé absent (${SHARED_CERTIFICATE}) — repli sur le certificat auto-signé de Next, ` +
  'qui ne couvre QUE localhost / 127.0.0.1 / ::1. https://meeshy.local:3100, annoncé par les ' +
  'bannières du Makefile, affichera un nom invalide. Le combler : make setup-certs';

// `--experimental-https` reste TOUJOURS là : c'est lui qui allume TLS. Mesuré
// (patron `apps/web-old-version3/scripts/dev-https.mjs`) — passer seulement
// `--experimental-https-key` / `--experimental-https-cert` fait démarrer
// Next 15.5.23 en CLAIR, et sa bannière annonce alors `http://…` sans que
// rien ne signale l'erreur. Les deux chemins d'accès aux fichiers ne sont que
// le choix du certificat ; le drapeau est le commutateur.
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
