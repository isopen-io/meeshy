/**
 * Le traducteur ne publie AUCUN port en staging et en production (#19520).
 *
 * Les routes HTTP `/api/v1/voice/*` du traducteur reposent sur une identité
 * qu'il ne vérifie pas : en staging et en production, leur SEULE protection
 * est que le port 8000 n'est joignable que depuis le réseau interne (la
 * passerelle passe par `translator:8000` et ZMQ). `#9662` et `#9671` ont
 * retiré le routage Traefik ; aucune garde n'affirmait qu'il ne revenait pas
 * par une autre porte — un `ports:`, un `traefik.enable=true` sous une autre
 * forme, ou `network_mode: host`. Le traducteur n'a besoin d'AUCUN
 * `network_mode` : l'absence de la clé est la seule forme admise (`host`,
 * `service:…`, `container:…`, une variable ou un commentaire de fin de ligne
 * rougissent tous).
 *
 * Même retournement que `scripts/check-compose-required-vars.mjs` sur les
 * FICHIERS : toute composition de `infrastructure/docker/compose/` qui n'est
 * pas explicitement rangée parmi celles qui ne déploient pas (dev, local) est
 * traitée comme DÉPLOYANTE, et tout service traducteur qu'elle déclare
 * (surcouche comprise) passe la règle. Un `docker-compose.preprod.yml` ajouté
 * demain hérite de la garde sans que personne n'ait à y penser.
 *
 * Pas de vert vide : le service traducteur ATTENDU de chaque composition
 * déployante principale doit être trouvé — un renommage rougit — et toute
 * composition déployante doit exposer au moins un bloc de service reconnu
 * (un en-tête `services:` mal lu ne fait plus passer le fichier en silence).
 *
 * Lecture ligne à ligne, sans parseur YAML — même patron que
 * `admin-ui-ssh-tunnel-only.test.ts` et
 * `staging-admin-surfaces-ssh-tunnel-only.test.ts`. Ce qu'un parseur ligne
 * à ligne ne peut pas suivre (fusion `<<:`, `extends:`) est REFUSÉ plutôt
 * que deviné : fail-closed.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';

const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');

const NON_DEPLOYING = ['docker-compose.dev.yml', 'docker-compose.local.yml', 'docker-compose.local-https.yml'] as const;

const EXPECTED_TRANSLATORS: ReadonlyArray<{ readonly file: string; readonly service: string }> = [
  { file: 'docker-compose.prod.yml', service: 'translator' },
  { file: 'docker-compose.staging.yml', service: 'translator-staging' },
];

type ServiceBlock = { readonly name: string; readonly lines: ReadonlyArray<string> };

type Violation =
  | 'ports-publies'
  | 'traefik-active'
  | 'routeur-traefik'
  | 'mode-reseau'
  | 'indirection-opaque';

const isComment = (line: string): boolean => /^\s*#/.test(line);

const SERVICES_HEADER = /^services:\s*(#.*)?$/;

function servicesSection(source: string): ReadonlyArray<string> {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => SERVICES_HEADER.test(l));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^\S/.test(l) && !isComment(l));
  return end === -1 ? rest : rest.slice(0, end);
}

function serviceBlocks(source: string): ReadonlyArray<ServiceBlock> {
  const section = servicesSection(source);
  const starts = section
    .map((line, index) => ({ index, match: /^ {2}([A-Za-z0-9_.-]+):\s*(#.*)?$/.exec(line) }))
    .filter((entry): entry is { index: number; match: RegExpExecArray } => entry.match !== null);
  return starts.map(({ index, match }, i) => {
    const next = starts[i + 1];
    const body = section.slice(index + 1, next === undefined ? section.length : next.index);
    return { name: match[1], lines: body.filter((l) => !isComment(l)) };
  });
}

function isTranslatorService(block: ServiceBlock): boolean {
  return (
    /translator/i.test(block.name) ||
    block.lines.some((l) => /^ {4}image:\s*.*meeshy-translator/.test(l))
  );
}

function publishesPorts(lines: ReadonlyArray<string>): boolean {
  const index = lines.findIndex((l) => /^ {4}ports:/.test(l));
  if (index === -1) return false;
  const inline = lines[index].replace(/^ {4}ports:\s*/, '').trim();
  if (inline !== '') return !/^\[\s*\]$/.test(inline);
  const following = lines.slice(index + 1);
  const end = following.findIndex((l) => /^ {0,4}\S/.test(l));
  const items = end === -1 ? following : following.slice(0, end);
  return items.some((l) => /^\s+-/.test(l));
}

function violations(block: ServiceBlock): ReadonlyArray<Violation> {
  const text = block.lines.join('\n');
  const checks: ReadonlyArray<readonly [Violation, boolean]> = [
    ['ports-publies', publishesPorts(block.lines)],
    ['traefik-active', /traefik\.enable["']?\s*[=:]\s*["']?true\b/i.test(text)],
    ['routeur-traefik', /traefik\.(http|tcp|udp)\.(routers|services)\./i.test(text)],
    ['mode-reseau', /^ {4}network_mode\s*:/m.test(text)],
    ['indirection-opaque', /^ {4}(<<|extends):/m.test(text)],
  ];
  return checks.filter(([, hit]) => hit).map(([violation]) => violation);
}

type FileVerdict = {
  readonly serviceCount: number;
  readonly translators: ReadonlyArray<{ readonly service: string; readonly violations: ReadonlyArray<Violation> }>;
};

function auditCompose(source: string): FileVerdict {
  const blocks = serviceBlocks(source);
  return {
    serviceCount: blocks.length,
    translators: blocks
      .filter(isTranslatorService)
      .map((block) => ({ service: block.name, violations: violations(block) })),
  };
}

const deployingComposeFiles = (): ReadonlyArray<string> =>
  fs
    .readdirSync(COMPOSE_DIR)
    .filter((entry) => /^docker-compose.*\.ya?ml$/.test(entry))
    .filter((entry) => !(NON_DEPLOYING as ReadonlyArray<string>).includes(entry))
    .sort();

const readCompose = (file: string): string => fs.readFileSync(path.join(COMPOSE_DIR, file), 'utf8');

const conformingTranslator = (name: string): string =>
  [
    'services:',
    `  ${name}:`,
    '    image: isopen/meeshy-translator:latest',
    '    logging: *journald-logging',
    '    # ports: ["8000:8000"] — commentaire, jamais lu',
    '    networks:',
    '      - meeshy-data',
    '    labels:',
    '      - "traefik.enable=false"',
    '      - "autoheal=true"',
    '  gateway:',
    '    image: isopen/meeshy-gateway:latest',
    '    ports:',
    '      - "3000:3000"',
    '    labels:',
    '      - "traefik.enable=true"',
    'volumes:',
    '  models_data:',
    '',
  ].join('\n');

const withTranslatorLines = (name: string, extra: ReadonlyArray<string>): string =>
  conformingTranslator(name).replace(
    '    networks:\n      - meeshy-data\n',
    ['    networks:', '      - meeshy-data', ...extra, ''].join('\n')
  );

describe('auditCompose — témoins internes sur fixtures (#19520)', () => {
  it('un traducteur conforme ne lève rien, et le service voisin publié ne le contamine pas', () => {
    expect(auditCompose(conformingTranslator('translator'))).toEqual({
      serviceCount: 2,
      translators: [{ service: 'translator', violations: [] }],
    });
  });

  it.each([
    ['liste', 'ports-publies', ['    ports:', '      - "8000:8000"']],
    ['liste liée à 127.0.0.1', 'ports-publies', ['    ports:', '      - "127.0.0.1:8000:8000"']],
    ['syntaxe longue', 'ports-publies', ['    ports:', '      - target: 8000', '        published: 8000']],
    ['en ligne', 'ports-publies', ['    ports: ["8000:8000"]']],
    ['label liste', 'traefik-active', ['    deploy:', '      labels:', '        - "traefik.enable=true"']],
    ['label map', 'traefik-active', ['    deploy:', '      labels:', '        traefik.enable: "true"']],
    ['label map booléen', 'traefik-active', ['    deploy:', '      labels:', '        traefik.enable: True']],
    ['routeur', 'routeur-traefik', ['    deploy:', '      labels:', '        - "traefik.http.routers.ml.rule=Host(`ml.x`)"']],
    ['réseau hôte', 'mode-reseau', ['    network_mode: host']],
    ['réseau hôte cité', 'mode-reseau', ['    network_mode: "host"']],
    ['réseau hôte commenté en fin de ligne', 'mode-reseau', ['    network_mode: host # partage la pile réseau']],
    ['réseau d’un autre service', 'mode-reseau', ['    network_mode: service:gateway']],
    ['réseau d’un conteneur', 'mode-reseau', ['    network_mode: "container:meeshy-gateway"']],
    ['réseau par variable', 'mode-reseau', ['    network_mode: ${NET_MODE:-host}']],
    ['réseau ponté explicite', 'mode-reseau', ["    network_mode: 'bridge'"]],
    ['fusion YAML', 'indirection-opaque', ['    <<: *translator-defaults']],
    ['extends', 'indirection-opaque', ['    extends:', '      service: translator-base']],
  ] as const)('%s ⇒ refusé (%s)', (_label, expected, extra) => {
    const verdict = auditCompose(withTranslatorLines('translator', extra));
    expect(verdict.translators.map((t) => t.service)).toEqual(['translator']);
    expect(verdict.translators[0].violations).toContain(expected);
  });

  it('un `ports: []` explicite ne publie rien', () => {
    expect(auditCompose(withTranslatorLines('translator', ['    ports: []'])).translators[0].violations).toEqual([]);
  });

  it('un traducteur renommé reste reconnu par son image', () => {
    expect(auditCompose(conformingTranslator('ml-worker')).translators.map((t) => t.service)).toEqual([
      'ml-worker',
    ]);
  });

  it('`services:` suivi d’un commentaire ouvre bien la section', () => {
    const source = conformingTranslator('translator').replace(/^services:$/m, 'services: # tous les conteneurs');
    expect(auditCompose(source).translators.map((t) => t.service)).toEqual(['translator']);
  });

  it('`services:` commenté et traducteur sur le réseau hôte ⇒ refusé, jamais ignoré', () => {
    const source = withTranslatorLines('translator', ['    network_mode: host']).replace(/^services:$/m, 'services:   # pile');
    expect(auditCompose(source).translators[0]?.violations).toContain('mode-reseau');
  });

  it('une composition sans aucun bloc de service reconnu le DIT — jamais un vert vide', () => {
    expect(auditCompose('version: "3.8"\nvolumes:\n  models_data:\n').serviceCount).toBe(0);
    expect(auditCompose(['services:', '    translator:', '      ports: ["8000:8000"]', ''].join('\n')).serviceCount).toBe(0);
    expect(auditCompose(conformingTranslator('translator')).serviceCount).toBe(2);
  });

  it('sans traducteur, le verdict est VIDE — la garde réelle doit alors rougir', () => {
    const source = conformingTranslator('translator').replace(/ {2}translator:\n {4}image: isopen\/meeshy-translator:latest\n/, '  worker:\n    image: isopen/other:latest\n');
    expect(auditCompose(source).translators).toEqual([]);
  });
});

describe('le traducteur ne publie aucun port en staging et en production (#19520)', () => {
  const files = deployingComposeFiles();

  it('les compositions déployantes principales sont bien parmi les fichiers lus', () => {
    expect(files).toEqual(expect.arrayContaining(EXPECTED_TRANSLATORS.map((e) => e.file)));
  });

  it.each(EXPECTED_TRANSLATORS)('$file déclare toujours le service traducteur « $service »', ({ file, service }) => {
    const found = auditCompose(readCompose(file)).translators.map((t) => t.service);
    expect({ file, found: found.includes(service) }).toEqual({ file, found: true });
  });

  it.each(files)('%s : au moins un bloc de service est reconnu — jamais un vert vide', (file) => {
    expect({ file, recognised: auditCompose(readCompose(file)).serviceCount > 0 }).toEqual({ file, recognised: true });
  });

  it.each(files)('%s : aucun service traducteur ne publie de port, ni Traefik, ni network_mode', (file) => {
    const offending = auditCompose(readCompose(file)).translators.filter((t) => t.violations.length > 0);
    expect({ file, offending }).toEqual({ file, offending: [] });
  });
});
