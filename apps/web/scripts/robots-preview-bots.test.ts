/**
 * #9712 — `robots.txt` laisse les robots d'APERÇU déplier une invitation.
 *
 * Twitterbot (X) et LinkedInBot lisent `robots.txt` avant de déplier un lien :
 * sous le seul groupe `*`, qui ferme `/chat`, ils ne demandaient jamais la page
 * d'aperçu que Traefik leur réserve. Leur groupe ouvre `/chat/` et garde fermé
 * tout le reste — un groupe nommé REMPLACE le groupe `*` pour ce robot.
 *
 * Le témoin applique la règle de la RFC 9309 (groupe du robot, sinon `*` ; la
 * règle la plus longue gagne ; à longueur égale, `Allow`) au fichier publié.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Rule = { readonly allow: boolean; readonly path: string };
type Group = { readonly agents: readonly string[]; readonly rules: readonly Rule[] };

const ROBOTS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'robots.txt'), 'utf8');

const groups = (text: string): readonly Group[] => {
  const parsed: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const [field = '', ...rest] = line.split(':');
    const value = rest.join(':').trim();
    const key = field.trim().toLowerCase();
    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        parsed.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((key === 'allow' || key === 'disallow') && current) {
      current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  return parsed;
};

const allowed = (agent: string, path: string): boolean => {
  const all = groups(ROBOTS);
  const group = all.find((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().startsWith(a)))
    ?? all.find((g) => g.agents.includes('*'));
  const matching = (group?.rules ?? []).filter((rule) => rule.path !== '' && path.startsWith(rule.path));
  const best = matching.sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))[0];
  return best?.allow ?? true;
};

const PREVIEW_BOTS = ['Twitterbot', 'LinkedInBot', 'facebookexternalhit', 'Slackbot-LinkExpanding', 'Discordbot', 'TelegramBot', 'WhatsApp'];

describe('robots.txt — les robots d’aperçu déplient une invitation, rien de plus', () => {
  for (const bot of PREVIEW_BOTS) {
    test(`${bot} peut demander /chat/<lien>`, () => {
      expect(allowed(bot, '/chat/mshy_abc')).toBe(true);
    });

    test(`${bot} reste fermé au reste de l’application`, () => {
      for (const path of ['/settings', '/conversations', '/api/v1/conversations', '/u/zoe', '/chat']) {
        expect(allowed(bot, path)).toBe(false);
      }
      expect(allowed(bot, '/about')).toBe(true);
    });
  }

  test('les moteurs de recherche, eux, restent hors de /chat', () => {
    expect(allowed('Googlebot', '/chat/mshy_abc')).toBe(false);
    expect(allowed('Bingbot', '/chat/mshy_abc')).toBe(false);
  });
});
