import { describe, expect, test } from 'bun:test';

import {
  SAMPLE,
  deadAddresses,
  documentVerdict,
  emailLinkAliases,
  emailSecretLinksIn,
  emittedPathsIn,
  nginxServing,
  pathTableIn,
  selfLinksIn,
  resolveServing,
  type ServingTable,
} from './emitted-addresses.mjs';

/**
 * UN GATE PART DE CE QUI EST ÉMIS, JAMAIS DE CE QUI EST SERVI (#7312).
 *
 * `/help`, `/faq`, `/download` et `/reel/<id>` sont morts en silence : la
 * coquille rendait 200 pour chacun, et le seul gate des adresses ne regardait
 * que les sept pages qu'il SAVAIT servir. Ces témoins éprouvent les deux
 * moitiés du gate sur des fixtures : la lecture de ce qu'une source ÉMET, et le
 * jugement de ce que le web SERT — redirections nginx, alias, documents,
 * écrans, fichiers.
 */

const NGINX = `
map $uri $meeshy_app_route {
    default 0;
    ~^/(@[^/]+|c|chat|feeds|reel|u)(/|$) 1;
}
server {
    location ~ ^/join/(.+)$ {
        return 308 /chat/$1$is_args$args;
    }
    location = /join {
        return 302 /;
    }
    location ~ ^/conversation/([^/]+)/?$ {
        return 308 /c/$1$is_args$args;
    }
    location = / {
        if ($arg_affiliate) {
            return 308 /signup/affiliate/$arg_affiliate;
        }
        try_files /landing.html /index.html =404;
    }
    location ~ ^/(about|help|privacy)(\\.html|/)?$ {
        try_files $uri $uri.html $uri/index.html /index.html;
    }
}
`;

const ALIASES = `export const EMAIL_LINK_ALIASES: Readonly<Record<string, string>> = {
  '/auth/email-link/magic-link': '/auth/magic-link',
};`;

const table = (over: Partial<ServingTable> = {}): ServingTable => ({
  ...nginxServing(NGINX),
  screens: ['/c/:conversation', '/chat/:link', '/feeds/post/:post', '/reel/:post', '/u/:username', '/@:username', '/auth/magic-link'],
  aliases: emailLinkAliases(ALIASES),
  isFile: (path) => path === '/brand/logo.png',
  ...over,
});

describe('ce qu’une source émet', () => {
  test('un littéral Swift interpolé devient une adresse à segment variable, avec sa ligne', () => {
    const swift = 'let a = 1\n        case .reel: return "https://meeshy.me/reel/\\(contentId)"\n';
    expect(emittedPathsIn(swift, 'apps/ios/X.swift')).toEqual([
      { file: 'apps/ios/X.swift', line: 2, path: `/reel/${SAMPLE}`, open: false },
    ]);
  });

  test('l’origine composée de la passerelle et de l’app compte comme meeshy.me', () => {
    const ts = 'const a = `<a href="${this.frontendUrl}/privacy">`;\nconst b = `${resolveFrontendBaseUrl()}/l/${token}`;';
    const swift = 'var joinUrl: String { "\\(MeeshyConfig.shared.webOrigin)/chat/\\(identifier ?? linkId)" }';
    expect(emittedPathsIn(ts, 'g.ts').map((e) => e.path)).toEqual(['/privacy', `/l/${SAMPLE}`]);
    expect(emittedPathsIn(swift, 's.swift').map((e) => e.path)).toEqual([`/chat/${SAMPLE}`]);
  });

  test('requête et fragment ne font pas partie de l’adresse', () => {
    const ts = 'const u = `${frontendUrl}/settings#notifications`; const v = "https://meeshy.me/l/abc?x=1";';
    expect(emittedPathsIn(ts, 'g.ts').map((e) => e.path)).toEqual(['/settings', '/l/abc']);
  });

  test('un littéral qui finit par « / » est OUVERT : la suite est concaténée', () => {
    const swift = 'return URL(string: "https://meeshy.me/u/" + name)';
    expect(emittedPathsIn(swift, 's.swift')).toEqual([{ file: 's.swift', line: 1, path: '/u/', open: true }]);
  });

  test('un commentaire n’émet rien, l’origine nue non plus, ni un autre hôte', () => {
    const src = [
      '/// Ouvre `https://meeshy.me/story/<id>` depuis un lien.',
      ' * `https://meeshy.me/chat|join/<clé>`',
      '// https://meeshy.me/help',
      'let home = "https://meeshy.me"',
      'let api = "https://gate.meeshy.me/api/v1/x"',
      'let x = 1 // voir https://meeshy.me/faq',
    ].join('\n');
    expect(emittedPathsIn(src, 's.swift')).toEqual([]);
  });

  test('www et staging sont la même application web', () => {
    const src = '"https://www.meeshy.me/about" "https://staging.meeshy.me/terms"';
    expect(emittedPathsIn(src, 's.swift').map((e) => e.path)).toEqual(['/about', '/terms']);
  });

  test('la table de chemins partagée émet une adresse par type de contenu', () => {
    const shared = "export const CONTENT_WEB_PATHS: Readonly<Record<ContentKind, string>> = {\n  POST: 'post',\n  REEL: 'reel',\n};";
    expect(pathTableIn(shared, 'packages/shared/utils/content-link.ts', 'CONTENT_WEB_PATHS')).toEqual([
      { file: 'packages/shared/utils/content-link.ts', line: 2, path: `/post/${SAMPLE}`, open: false },
      { file: 'packages/shared/utils/content-link.ts', line: 3, path: `/reel/${SAMPLE}`, open: false },
    ]);
  });

  test('le web émet aussi ses liens relatifs vers lui-même', () => {
    const tsx = '<a href="/about">À propos</a>\n<a href={`/l/${token}`}>x</a>\nconst nav = { href: \'/download\' };\n<a href="https://ailleurs.org/x">';
    expect(selfLinksIn(tsx, 'apps/web/src/x.tsx').map((e) => e.path)).toEqual(['/about', `/l/${SAMPLE}`, '/download']);
  });

  test('les chemins des liens d’e-mail : leur table, et chaque lien composé hors d’elle', () => {
    const table = "export const EMAIL_LINK_PATHS = {\n  magicLink: '/auth/email-link/magic-link',\n} as const;";
    expect(pathTableIn(table, 'e.ts', 'EMAIL_LINK_PATHS').map((e) => e.path)).toEqual(['/auth/email-link/magic-link']);
    const use = "  return emailSecretLink({ base, path: '/auth/revoke-sessions', secret: { token } });";
    expect(emailSecretLinksIn(use, 'e.ts')).toEqual([{ file: 'e.ts', line: 1, path: '/auth/revoke-sessions', open: false }]);
  });

  test('une table disparue rougit au lieu de rendre zéro adresse', () => {
    expect(() => pathTableIn('export const AUTRE = {};', 'x.ts', 'CONTENT_WEB_PATHS')).toThrow(/CONTENT_WEB_PATHS/);
  });

  test('l’origine passée en paramètre ou lue dans l’environnement compte aussi', () => {
    const ts = "const a = `${origin}/u/${name}`;\nconst b = `${process.env.FRONTEND_URL || 'http://localhost:3100'}/signup/affiliate/${token}`;\nconst c = `${baseUrl}/api/v1/x`;";
    expect(emittedPathsIn(ts, 'services/gateway/src/g.ts').map((e) => e.path)).toEqual([`/u/${SAMPLE}`, `/signup/affiliate/${SAMPLE}`]);
  });

  test('hors de la passerelle, `origin` est celle de la page : rien n’est émis vers meeshy.me', () => {
    const ts = 'const u = `${origin}/_capacitor_file_${path}`;';
    expect(emittedPathsIn(ts, 'apps/web/src/lib/share-incoming/native-inbox.ts')).toEqual([]);
  });
});

describe('ce que le web sert', () => {
  test('un écran de la table que nginx laisse passer est servi', () => {
    expect(resolveServing(`/reel/${SAMPLE}`, table()).kind).toBe('screen');
    expect(resolveServing(`/@${SAMPLE}`, table()).kind).toBe('screen');
  });

  test('un écran que le routeur connaît mais que nginx refuse n’est PAS servi', () => {
    const verdict = resolveServing('/auth/magic-link', table());
    expect(verdict.kind).toBe('dead');
  });

  test('une redirection nginx se suit jusqu’à sa cible, qui doit être servie', () => {
    expect(resolveServing(`/join/${SAMPLE}`, table())).toEqual({ kind: 'redirect', target: `/chat/${SAMPLE}` });
    expect(resolveServing(`/conversation/${SAMPLE}`, table())).toEqual({ kind: 'redirect', target: `/c/${SAMPLE}` });
    expect(resolveServing('/join', table())).toEqual({ kind: 'redirect', target: '/' });
  });

  test('un alias de lien d’e-mail se juge à son adresse canonique', () => {
    const ok = table({ appPrefix: /^\/(auth)(\/|$)/ });
    expect(resolveServing('/auth/email-link/magic-link', ok)).toEqual({ kind: 'alias', target: '/auth/magic-link' });
  });

  test('un document nginx est servi, avec ou sans barre finale ; un fichier public aussi', () => {
    expect(resolveServing('/about', table()).kind).toBe('document');
    expect(resolveServing('/about/', table()).kind).toBe('document');
    expect(resolveServing('/brand/logo.png', table()).kind).toBe('file');
  });

  test('une adresse ouverte est servie si elle l’est telle quelle OU complétée', () => {
    expect(deadAddresses([{ file: 's.swift', line: 1, path: '/u/', open: true }], table())).toEqual([]);
    expect(deadAddresses([{ file: 's.swift', line: 1, path: '/zz/', open: true }], table())).toHaveLength(1);
  });
});

describe('les deux falsifications du critère de fin', () => {
  test('retirer /about de la table nginx fait rougir le lien qui l’émet', () => {
    const emitted = [{ file: 'apps/ios/AboutView.swift', line: 7, path: '/about', open: false }];
    expect(deadAddresses(emitted, table())).toEqual([]);
    const sans = nginxServing(NGINX.replace('about|', ''));
    expect(deadAddresses(emitted, table(sans)).map((d) => d.message)).toEqual([
      'apps/ios/AboutView.swift:7 émet /about, non servie',
    ]);
  });

  test('un lien iOS vers une adresse non servie rougit et nomme sa source', () => {
    const swift = 'URL(string: "https://meeshy.me/faq")!';
    const dead = deadAddresses(emittedPathsIn(swift, 'apps/ios/Meeshy/Features/Settings/Views/SupportView.swift'), table());
    expect(dead.map((d) => d.message)).toEqual([
      'apps/ios/Meeshy/Features/Settings/Views/SupportView.swift:1 émet /faq, non servie',
    ]);
  });
});

describe('une vraie page n’est pas la coquille', () => {
  const shell = { title: 'Meeshy', bytes: 3769 };

  test('le document dont le titre et le poids diffèrent de la coquille est vrai', () => {
    expect(documentVerdict({ title: 'À propos de Meeshy', bytes: 36525 }, shell)).toBeNull();
  });

  test('la coquille servie à la place du document est dite, et pourquoi', () => {
    expect(documentVerdict({ title: 'Meeshy', bytes: 3769 }, shell)).toBe('servie par la coquille de l’application (titre « Meeshy », 3769 octets)');
    expect(documentVerdict(null, shell)).toBe('aucun document dans dist — nginx y rendrait la coquille de l’application');
  });
});
