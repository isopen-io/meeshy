/**
 * LES ADRESSES ÉMISES vers meeshy.me, et ce que le web en SERT (#7312).
 *
 * `/help`, `/faq`, `/download` et `/reel/<id>` sont morts en silence : l'app
 * iOS publiée, le SMS d'invitation et la passerelle les émettaient, et la
 * coquille de l'application répondait 200 pour chacun. Le seul gate des
 * adresses (`check-institutional.mjs`) ne regardait que les pages qu'il SAVAIT
 * servir — il affirmait « ces pages-là sont correctes » et laissait sans
 * preuve « ce sont les adresses que l'on émet ».
 *
 * Ce module part donc de l'autre bout. Il lit, dans les sources, chaque
 * adresse composée sur l'origine web (littéral `https://meeshy.me/…`, ou
 * origine composée : `webOrigin` côté Swift, `frontendUrl` /
 * `resolveFrontendBaseUrl()` côté passerelle), puis la juge contre ce que le
 * web sert VRAIMENT, dans l'ordre où nginx le décide : redirections, documents
 * prérendus, fichiers publics, puis écrans de l'application — un écran
 * n'étant servi que si la table des routes le connaît ET si nginx laisse son
 * premier segment atteindre la coquille (`$meeshy_app_route`, #10123).
 *
 * Les fonctions sont pures : le gate (`check-emitted-addresses.mjs`) leur
 * passe les textes lus sur le disque, les témoins des fixtures.
 */

/** La valeur d'un segment variable (`\(id)`, `${token}`, `<id>`, `{n}`). */
export const SAMPLE = 'x7k2';

/**
 * Les origines web reconnues. Un littéral sur meeshy.me (www et staging sont
 * la même application), ou une expression d'origine que le code COMPOSE —
 * celle-ci n'apparaît jamais comme un `https://` dans la source, et c'est par
 * elle que la passerelle fabriquait `/reel/<id>`.
 */
const ORIGIN = new RegExp(
  [
    String.raw`https?://(?:www\.|staging\.)?meeshy\.me(?![A-Za-z0-9-]|\.[A-Za-z0-9])`,
    String.raw`\\\((?:MeeshyConfig\.shared\.)?(?:webOrigin|webBaseURL|origin)\)`,
    String.raw`\$\{(?:this\.)?(?:frontendUrl|FRONTEND_URL|webOrigin|resolveFrontendBaseUrl\(\))\}`,
    String.raw`\$\{process\.env\.FRONTEND_URL[^}]*\}`,
  ].join('|'),
  'g',
);

/**
 * Dans la passerelle, `origin` et `baseUrl` SONT l'origine web (`FRONTEND_URL`
 * passé en paramètre aux composeurs d'aperçu et de parrainage). Ailleurs — le
 * web, la coque — `origin` est celle de la page, et ce qu'on y compose n'est
 * pas une adresse que nginx sert (`/_capacitor_file_…`).
 */
const GATEWAY_ORIGIN = new RegExp(`${ORIGIN.source}|\\$\\{(?:params\\.)?(?:origin|baseUrl)\\}`, 'g');
const originFor = (file) => (file.startsWith('services/gateway/') ? GATEWAY_ORIGIN : ORIGIN);

/** Un texte sans aucune origine reconnaissable n'émet rien : on ne le découpe pas en lignes (onze mille fichiers lus). */
const MAY_EMIT = /meeshy\.me|webOrigin|webBaseURL|frontendUrl|FRONTEND_URL|resolveFrontendBaseUrl|\\\(origin\)|\{(?:params\.)?origin\}|\{baseUrl\}/;

const PATH_CHAR = /[A-Za-z0-9_\-./@~%]/;

/** Une ligne de commentaire, ou la fin commentée d'une ligne de code. */
const isCommentLine = (line) => /^\s*(?:\/\/|\/\*|\*|#(?!Preview)|<!--)/.test(line);
const withoutTrailingComment = (line) => line.replace(/(^|\s)\/\/\s.*$/, '$1');

/** Saute un groupe équilibré (`\(…)`, `${…}`) ; rend l'index qui le suit. */
const skipBalanced = (text, from, open, close) => {
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
};

/**
 * Lit le chemin qui suit une origine, à partir de son `/`. Les interpolations
 * et les gabarits (`<id>`, `{n}`, `…`) deviennent un segment variable ; la
 * requête et le fragment terminent l'adresse.
 */
const readPath = (text, start) => {
  let path = '';
  let i = start;
  while (i < text.length) {
    const c = text[i];
    if (text.startsWith('\\(', i)) {
      path += SAMPLE;
      i = skipBalanced(text, i + 1, '(', ')');
    } else if (text.startsWith('${', i)) {
      path += SAMPLE;
      i = skipBalanced(text, i + 1, '{', '}');
    } else if (c === '<' || c === '{') {
      const end = text.indexOf(c === '<' ? '>' : '}', i);
      path += SAMPLE;
      i = end === -1 ? text.length : end + 1;
    } else if (c === '…' || text.startsWith('...', i)) {
      path += SAMPLE;
      break;
    } else if (PATH_CHAR.test(c)) {
      path += c;
      i += 1;
    } else break;
  }
  return path.replace(/\.+$/, '');
};

/**
 * Les adresses qu'un texte émet vers l'application web. `open` : le littéral
 * s'arrête sur une barre finale, la suite étant concaténée (`"…/u/" + name`).
 */
export function emittedPathsIn(text, file) {
  if (!MAY_EMIT.test(text)) return [];
  return text.split('\n').flatMap((raw, index) => {
    if (!MAY_EMIT.test(raw) || isCommentLine(raw)) return [];
    const line = withoutTrailingComment(raw);
    return [...line.matchAll(originFor(file))]
      .map((m) => m.index + m[0].length)
      .filter((end) => line[end] === '/')
      .map((end) => readPath(line, end))
      .filter((path) => path.length > 1 && !path.startsWith('/api/'))
      .map((path) => ({ file, line: index + 1, path, open: path.endsWith('/') && !path.endsWith(`${SAMPLE}/`) }));
  });
}

/**
 * Les liens que le web écrit vers LUI-MÊME (`href="/about"`, `href: '/x'`,
 * `` href={`/l/${token}`} ``) : relatifs, ils ne portent aucune origine, et une
 * page morte de la landing ou des documents se lirait sinon comme « rien
 * d'émis ».
 */
export function selfLinksIn(text, file) {
  if (!text.includes('href')) return [];
  return text.split('\n').flatMap((raw, index) => {
    if (isCommentLine(raw)) return [];
    const line = withoutTrailingComment(raw);
    return [...line.matchAll(/\bhref(?:=\{?|:\s*)["'`](?=\/[A-Za-z@])/g)]
      .map((m) => readPath(line, m.index + m[0].length))
      .filter((path) => path.length > 1)
      .map((path) => ({ file, line: index + 1, path, open: false }));
  });
}

/**
 * Les tables de chemins : la passerelle et les clients y composent l'adresse
 * sans jamais écrire le chemin à côté d'une origine. `CONTENT_WEB_PATHS`
 * (`packages/shared/utils/content-link.ts`) porte des SEGMENTS, suivis de
 * l'identifiant du contenu ; `EMAIL_LINK_PATHS`
 * (`services/gateway/src/utils/email-secret-link.ts`) porte des CHEMINS. Chaque
 * entrée est une adresse émise.
 */
export const PATH_TABLES = {
  CONTENT_WEB_PATHS: (value) => `/${value}/${SAMPLE}`,
  EMAIL_LINK_PATHS: (value) => value,
};

export function pathTableIn(text, file, name) {
  const toPath = PATH_TABLES[name];
  const lines = text.split('\n');
  const start = lines.findIndex((l) => new RegExp(`\\b${name}\\b.*=\\s*\\{`).test(l));
  if (start === -1) throw new Error(`${file} ne déclare plus ${name} — ses adresses ne seraient plus lues`);
  const entries = [];
  for (let i = start + 1; i < lines.length && !/^\s*\}/.test(lines[i]); i += 1) {
    const m = lines[i].match(/^\s*[A-Za-z_]+:\s*'([^']+)'/);
    if (m) entries.push({ file, line: i + 1, path: toPath(m[1]), open: false });
  }
  return entries;
}

/** `emailSecretLink({ base, path: '/x', … })` : l'origine est un paramètre, le chemin un littéral. */
export function emailSecretLinksIn(text, file) {
  if (!text.includes('emailSecretLink(')) return [];
  return text.split('\n').flatMap((line, index) =>
    isCommentLine(line)
      ? []
      : [...line.matchAll(/emailSecretLink\(\{[^}]*?\bpath:\s*'(\/[^']*)'/g)].map((m) => ({ file, line: index + 1, path: m[1], open: false })),
  );
}

/** `EMAIL_LINK_ALIASES` (`packages/shared/utils/email-link-secret.ts`), lu dans son texte. */
export function emailLinkAliases(text) {
  const literal = text.match(/EMAIL_LINK_ALIASES[^=]*=\s*\{([\s\S]*?)\};/);
  if (literal === null) throw new Error('EMAIL_LINK_ALIASES introuvable — les alias de lien d’e-mail ne seraient plus suivis');
  return Object.fromEntries([...literal[1].matchAll(/'([^']+)':\s*'([^']+)'/g)].map(([, from, to]) => [from, to]));
}

const stripArgs = (target) => target.replace(/\$is_args\$args$/, '');

/**
 * Ce que `nginx.conf` décide avant la coquille : les redirections (`return
 * 30x`), les documents prérendus (`location ~ ^/(a|b)(\.html|/)?$`, et la
 * racine) et le préfixe des adresses de l'application (`$meeshy_app_route`).
 */
export function nginxServing(text) {
  const redirects = [...text.matchAll(/location\s+(=|~)\s+(\S+)\s*\{\s*return\s+30\d\s+([^;\s]+);/g)].map(
    ([, mode, pattern, target]) => {
      const to = stripArgs(target);
      if (mode === '=') return (path) => (path === pattern ? to : null);
      const re = new RegExp(pattern);
      return (path) => {
        const m = re.exec(path);
        return m === null ? null : to.replace(/\$(\d)/g, (_, n) => m[Number(n)] ?? '');
      };
    },
  );
  const documents = [...text.matchAll(/location\s+~\s+\^\/\(([a-z|-]+)\)\(\\\.html\|\/\)\?\$/g)].flatMap(([, names]) =>
    names.split('|').map((n) => `/${n}`),
  );
  if (/location\s+=\s+\/\s*\{/.test(text)) documents.push('/');
  const app = text.match(/map \$uri \$meeshy_app_route \{[\s\S]*?~(\^[^\s]+)\s+1;/);
  return { redirects, documents, appPrefix: app === null ? null : new RegExp(app[1]) };
}

/** `/c/:conversation`, `/@:username` → expression du segment variable. */
const routeRegex = (pattern) =>
  new RegExp(
    `^${pattern
      .split('/')
      .map((seg) => seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z0-9_]+/, '[^/]+'))
      .join('/')}/?$`,
  );

const trimSlash = (path) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

/**
 * Comment le web sert une adresse : `screen`, `document`, `file`, `redirect`
 * ou `alias` (avec la cible, elle-même servie), ou `dead` avec la raison.
 */
export function resolveServing(path, table, depth = 0) {
  if (depth > 4) return { kind: 'dead', reason: 'boucle de redirections' };
  const bare = trimSlash(path);
  const alias = table.aliases[bare];
  if (alias !== undefined) {
    const next = resolveServing(alias, table, depth + 1);
    return next.kind === 'dead' ? next : { kind: 'alias', target: alias };
  }
  for (const redirect of table.redirects) {
    const target = redirect(path);
    if (target === null) continue;
    const next = resolveServing(target, table, depth + 1);
    return next.kind === 'dead' ? { kind: 'dead', reason: `redirigée vers ${target}, ${next.reason}` } : { kind: 'redirect', target };
  }
  if (table.documents.includes(bare)) return { kind: 'document', target: bare };
  if (table.isFile(path)) return { kind: 'file', target: path };
  const known = table.screens.some((pattern) => routeRegex(pattern).test(path));
  if (!known) return { kind: 'dead', reason: 'non servie' };
  if (table.appPrefix === null || !table.appPrefix.test(bare)) {
    return { kind: 'dead', reason: 'non servie (la table des routes la connaît, nginx répond 404)' };
  }
  return { kind: 'screen', target: bare };
}

/**
 * Les adresses émises que le web ne sert pas, chacune avec sa source. Une
 * adresse OUVERTE est servie telle quelle (`/about/`) ou complétée de son
 * segment concaténé (`/u/<pseudo>`).
 */
export function deadAddresses(emitted, table) {
  return emitted.flatMap((e) => {
    const candidates = e.open ? [e.path, `${e.path}${SAMPLE}`] : [e.path];
    const verdicts = candidates.map((p) => resolveServing(p, table));
    if (verdicts.some((v) => v.kind !== 'dead')) return [];
    return [{ ...e, message: `${e.file}:${e.line} émet ${e.path}, ${verdicts.at(-1).reason}` }];
  });
}

/**
 * Un document est VRAI s'il n'est pas la coquille : nginx retombe sur
 * `index.html` quand son fichier manque, et la réponse a alors toutes les
 * apparences de la vie (200, titre « Meeshy »). Seuls le titre et le poids
 * tranchent. `null` : le document est vrai.
 */
export function documentVerdict(document, shell) {
  if (document === null) return 'aucun document dans dist — nginx y rendrait la coquille de l’application';
  if (document.title === shell.title || document.bytes === shell.bytes) {
    return `servie par la coquille de l’application (titre « ${document.title} », ${document.bytes} octets)`;
  }
  return null;
}
