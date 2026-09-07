import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  SELF_SIGNED_FALLBACK,
  SHARED_CERTIFICATE,
  SHARED_KEY,
  planDevHttps,
} from '../scripts/dev-https.mjs';

const REPOSITORY = join(__dirname, '..', '..', '..');

const CERT = '/depot/infrastructure/docker/compose/certs/cert.pem';
const KEY = '/depot/infrastructure/docker/compose/certs/key.pem';

const plan = (present: readonly string[]) =>
  planDevHttps({
    nextArgs: ['-p', '3300'],
    certificate: CERT,
    key: KEY,
    exists: (path: string) => present.includes(path),
  });

describe('le HTTPS de dév de la zone v3', () => {
  it('sert le certificat partagé du dépôt quand il est là', () => {
    const chosen = plan([CERT, KEY]);

    expect(chosen.args).toEqual([
      'dev',
      '-p',
      '3300',
      '--experimental-https',
      '--experimental-https-key',
      KEY,
      '--experimental-https-cert',
      CERT,
    ]);
    expect(chosen.servesLocalDomain).toBe(true);
  });

  it("allume TLS dans les DEUX cas — sans --experimental-https, Next 15.5 démarre en clair", () => {
    expect(plan([CERT, KEY]).args).toContain('--experimental-https');
    expect(plan([]).args).toContain('--experimental-https');
  });

  it('replie sur le certificat auto-signé de Next quand le partagé manque', () => {
    expect(plan([]).args).toEqual(['dev', '-p', '3300', '--experimental-https']);
    expect(plan([]).servesLocalDomain).toBe(false);
  });

  it("traite une PAIRE incomplète comme absente — une clé sans certificat ne sert rien", () => {
    expect(plan([CERT]).servesLocalDomain).toBe(false);
    expect(plan([KEY]).servesLocalDomain).toBe(false);
  });

  it('dit, dans le repli, que meeshy.local:3300 ne sera PAS servi — la bannière du Makefile l’annonce', () => {
    expect(plan([]).notice).toBe(SELF_SIGNED_FALLBACK);
    expect(plan([]).notice).toContain('meeshy.local:3300');
    expect(plan([]).notice).toContain('make setup-certs');
  });

  it('laisse passer les arguments de Next tels quels — le port reste déclaré dans package.json', () => {
    expect(planDevHttps({
      nextArgs: ['-p', '4300', '--turbo'],
      certificate: CERT,
      key: KEY,
      exists: () => true,
    }).args.slice(0, 4)).toEqual(['dev', '-p', '4300', '--turbo']);
  });

  it("vise l'emplacement PARTAGÉ que make setup-certs alimente, hors des deux zones", () => {
    expect(SHARED_CERTIFICATE).toBe('infrastructure/docker/compose/certs/cert.pem');
    expect(SHARED_KEY).toBe('infrastructure/docker/compose/certs/key.pem');
    expect(SHARED_CERTIFICATE.startsWith('apps/')).toBe(false);
    expect(existsSync(join(REPOSITORY, 'infrastructure', 'docker', 'compose'))).toBe(true);
  });
});
