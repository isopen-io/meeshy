/**
 * Les chemins d'AUTHENTIFICATION ne journalisent pas d'identifiant dans la
 * console du navigateur (#7490).
 *
 * La console appartient à la personne, donc rien ne « fuit » sur le réseau —
 * mais elle n'est pas un canal privé pour autant : un outil de supervision
 * d'erreurs (Sentry, LogRocket) capte `console.log` par défaut et l'expédie à
 * un tiers, une extension le lit, une capture d'écran de console jointe à un
 * ticket de support l'emporte avec elle. Une adresse e-mail saisie pendant une
 * récupération de compte n'a rien à faire là.
 *
 * `logger` (`@/utils/logger`) existe pour ça : en production il ne laisse
 * passer que ERROR et WARN, donc un diagnostic en `debug`/`info` disparaît du
 * navigateur des utilisateurs sans disparaître du poste de développement.
 *
 * Pourquoi une garde de FICHIER et pas seulement un témoin de comportement :
 * ce qu'on veut tenir n'est pas « ce hook-ci se tait » mais « aucun de ces
 * chemins ne parle ». La règle est déjà écrite dans
 * `.github/pull_request_template.md` (« No Console Logs ») et n'est gardée par
 * rien — c'est très exactement pourquoi 202 occurrences ont pu s'accumuler
 * dans `apps/web`. Une règle que personne ne vérifie finit par être fausse.
 *
 * PÉRIMÈTRE : les chemins d'authentification seulement. `apps/web` est le
 * legacy gelé ; seule l'exception « faille de sécurité » autorise ce lot. Les
 * autres `console.log` du paquet ne sont pas visés ici (suivi dans #7490).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const WEB_ROOT = join(__dirname, '..', '..');

/** Les surfaces où l'utilisateur confie un identifiant. */
const AUTH_PATHS: readonly string[] = [
  'app/auth/verify-email/page.tsx',
  'app/auth/verify-phone/page.tsx',
  'components/auth/register-form/index.tsx',
  'hooks/use-auth.ts',
  'hooks/use-conversation-join.ts',
  'hooks/use-link-validation.ts',
  'hooks/use-recovery-submission.ts',
  'hooks/use-register-form.ts',
];

/**
 * `console.error` et `console.warn` restent permis : ils survivent au filtre de
 * production de `logger` par nature, et une erreur d'authentification doit
 * rester visible. Ce sont `log`/`info`/`debug` — le bavardage de mise au point —
 * qui n'ont pas lieu d'être.
 */
const FORBIDDEN = /\bconsole\.(log|info|debug)\s*\(/g;

const sourceOf = (relative: string) => readFileSync(join(WEB_ROOT, relative), 'utf8');

/** Une ligne commentée ne s'exécute pas : la garde vise le code vivant. */
const liveLines = (source: string) =>
  source
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => !line.trim().startsWith('//') && !line.trim().startsWith('*'));

describe("les chemins d'authentification ne parlent pas à la console", () => {
  AUTH_PATHS.forEach((relative) => {
    it(`${relative} n'appelle ni console.log, ni console.info, ni console.debug`, () => {
      const offenders = liveLines(sourceOf(relative))
        .filter(({ line }) => {
          FORBIDDEN.lastIndex = 0;
          return FORBIDDEN.test(line);
        })
        .map(({ line, number }) => `${relative}:${number}  ${line.trim()}`);

      expect(offenders).toEqual([]);
    });
  });

  it('la liste des chemins gardés ne se vide pas par accident', () => {
    expect(AUTH_PATHS.length).toBeGreaterThanOrEqual(8);
    AUTH_PATHS.forEach((relative) => {
      expect(() => sourceOf(relative)).not.toThrow();
    });
  });
});
