/**
 * #9712 — les ROBOTS d'aperçu qui déplient `/chat/<lien>` sont routés vers la
 * page d'aperçu de la passerelle ; les humains restent sur l'application.
 *
 * L'image web est un nginx STATIQUE (`apps/web/nginx.conf`) : sa coquille ne
 * porte aucune balise Open Graph, et un robot n'exécute pas de JavaScript. Le
 * tri se fait donc à la porte, dans Traefik, par l'agent : un routeur plus
 * prioritaire que celui de l'application réécrit `/chat/<lien>` en
 * `/api/v1/links/<lien>/og` et l'envoie au service de la passerelle.
 *
 * Lit le FICHIER du dépôt, sans parseur YAML — même patron que
 * `signed-file-addresses-out-of-access-logs.test.ts`. Les expressions sont
 * celles de Go (`(?i)`) ; on les exécute ici en JavaScript, seule différence :
 * l'indicateur d'insensibilité à la casse, posé à part.
 *
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
const COMPOSE_DIR = path.join(REPO, 'infrastructure', 'docker', 'compose');

const DEPLOIEMENTS = [
  {
    compose: 'docker-compose.staging.yml',
    router: 'frontend-staging-unfurl',
    frontendRouter: 'frontend-staging',
    gatewayRouter: 'gateway-staging',
  },
  {
    compose: 'docker-compose.prod.yml',
    router: 'frontend-unfurl',
    frontendRouter: 'frontend',
    gatewayRouter: 'gateway',
  },
] as const;

const ROBOTS = [
  'WhatsApp/2.23.20.0 A',
  'WhatsApp/2.24.10.80 i',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'facebookexternalhit/1.1 Facebot Twitterbot/1.0',
  'Twitterbot/1.0',
  'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  'TelegramBot (like TwitterBot)',
  'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
  'Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5 skype-url-preview@microsoft.com',
] as const;

const HUMAINS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.97;FBBV/620000000]',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54',
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36 LinkedInApp/9.29',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Telegram-iOS/10.14',
] as const;

const labelsOf = (source: string): readonly string[] =>
  [...source.matchAll(/^\s*-\s*"(traefik\.[^"]+)"\s*$/gm)].map((m) => m[1] as string);

/** Ce que Compose remet à Docker : `$$` est un dollar littéral. */
const composeLiteral = (value: string): string => value.replace(/\$\$/g, '$');

/** Une expression Go `(?i)…` en `RegExp` JavaScript. */
const goRegex = (source: string): RegExp =>
  source.startsWith('(?i)') ? new RegExp(source.slice(4), 'i') : new RegExp(source);

const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'services', 'gateway', 'route-manifest.json'), 'utf8')) as {
  readonly routes: ReadonlyArray<{ readonly method: string; readonly path: string }>;
};

describe.each(DEPLOIEMENTS)('$compose — les robots d’aperçu de /chat/<lien> vont à la passerelle', ({ compose, router, frontendRouter, gatewayRouter }) => {
  const labels = labelsOf(fs.readFileSync(path.join(COMPOSE_DIR, compose), 'utf8'));
  const value = (key: string) => {
    const raw = labels.find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1);
    return raw === undefined ? undefined : composeLiteral(raw);
  };
  const rule = value(`traefik.http.routers.${router}.rule`) ?? '';
  const frontendRule = value(`traefik.http.routers.${frontendRouter}.rule`) ?? '';
  const middlewares = (value(`traefik.http.routers.${router}.middlewares`) ?? '').split(',');
  const rewrite = middlewares[0] ?? '';

  it('écoute le MÊME hôte que l’application, sur /chat/<lien> seulement', () => {
    const hosts = frontendRule.replace(/^\(|\)$/g, '');
    expect(rule.includes(hosts)).toBe(true);

    const pathPattern = goRegex(rule.match(/PathRegexp\(`([^`]+)`\)/)?.[1] ?? '$^');
    expect(pathPattern.test('/chat/mshy_abc')).toBe(true);
    expect(pathPattern.test('/chat/mshy_67890abcdef12345.1712.x-y/')).toBe(true);
    expect(pathPattern.test('/chat/')).toBe(false);
    expect(pathPattern.test('/chat/a/b')).toBe(false);
    expect(pathPattern.test('/c/64f0c0ffee0000000000abcd')).toBe(false);
  });

  it('reconnaît les robots d’aperçu des messageries', () => {
    const agent = goRegex(rule.match(/HeaderRegexp\(`User-Agent`, `([^`]+)`\)/)?.[1] ?? '$^');
    expect(ROBOTS.filter((ua) => !agent.test(ua))).toEqual([]);
  });

  it('laisse les humains sur l’application — navigateurs et navigateurs intégrés compris', () => {
    const agent = goRegex(rule.match(/HeaderRegexp\(`User-Agent`, `([^`]+)`\)/)?.[1] ?? '$^');
    expect(HUMAINS.filter((ua) => agent.test(ua))).toEqual([]);
  });

  it('passe devant le routeur de l’application', () => {
    const priority = Number(value(`traefik.http.routers.${router}.priority`));
    const frontendPriority = Number(value(`traefik.http.routers.${frontendRouter}.priority`) ?? frontendRule.length);
    expect(priority).toBeGreaterThan(frontendPriority);
  });

  it('réécrit /chat/<lien> en la page d’aperçu que la passerelle SERT', () => {
    const regex = value(`traefik.http.middlewares.${rewrite}.replacepathregex.regex`) ?? '$^';
    const replacement = value(`traefik.http.middlewares.${rewrite}.replacepathregex.replacement`) ?? '';
    expect('/chat/mshy_abc'.replace(new RegExp(regex), replacement)).toBe('/api/v1/links/mshy_abc/og');
    expect('/chat/mshy_abc/'.replace(new RegExp(regex), replacement)).toBe('/api/v1/links/mshy_abc/og');
    expect(manifest.routes.some((r) => r.method === 'GET' && r.path === '/api/v1/links/:identifier/og')).toBe(true);
  });

  it('va au service de la passerelle, avec son TLS, son entrée et ses limites', () => {
    expect(value(`traefik.http.routers.${router}.service`)).toBe(gatewayRouter);
    expect(value(`traefik.http.routers.${router}.entrypoints`)).toBe(value(`traefik.http.routers.${gatewayRouter}.entrypoints`));
    expect(value(`traefik.http.routers.${router}.tls.certresolver`)).toBe(value(`traefik.http.routers.${gatewayRouter}.tls.certresolver`));
    expect(middlewares).toContain('rate-limit@file');
  });
});
