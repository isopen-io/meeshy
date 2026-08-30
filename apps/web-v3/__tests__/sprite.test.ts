/**
 * @jest-environment node
 */

// Le sprite Phosphor de la v3 [infra-2, issue #4446] — conception § 3.3, § 8.5 et
// annexe (« Sprite des 72 glyphes — brut / gzip »).
//
// POURQUOI CE TÉMOIN VIT DANS apps/web-v3 ALORS QUE LE GÉNÉRATEUR VIT DANS packages/icons
//
// Le générateur est nommé par la conception : `packages/icons/scripts/build-sprite.ts`,
// lancé en préparation (§ 9.3). Son témoin, lui, doit TOURNER : `packages/` n'a
// aucun harnais de test et n'entre dans aucune ligne de la matrice `test` de
// `ci.yml`, tandis que `apps/web-v3` y entre nommément. C'est exactement le
// précédent de `check-jetons.mjs`, qui garde le contenu de
// `packages/design-tokens` depuis `apps/web-v3`. Le plafond du sprite (§ 8.5)
// et sa mesure vivent d'ailleurs ici — `budgets.json` et `budgets-mesures.json`.
// Un garde hébergé ailleurs que là où il tourne ne garde rien (leçon du
// `check-lockfile-alignment.mjs`, qui a fait le chemin inverse pour la même
// raison).

import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

import {
  audit,
  cheminDuGlyphe,
  composeSprite,
  fichiersQuiReclament,
  fragmentDeMesures,
  formateAudit,
  glypheDeFichier,
  glyphesReferences,
  lisGlyphes,
  mesure,
  nomsReclames,
  racineDesTraces,
  symbole,
  symbolesDuSprite,
  tracesExistantes,
  verdict,
  SOURCES_QUI_RECLAMENT,
} from '@meeshy/icons/build-sprite';

const DEPOT = join(__dirname, '..', '..', '..');
const RACINE_ICONES = join(DEPOT, 'packages', 'icons');

const lis = (chemin: string): string => readFileSync(chemin, 'utf8');

// CE QUI RÉCLAME — la planche ET les sources de la v3, comme le fait le
// générateur. Le témoin ne relit pas la seule maquette : il opposerait alors le
// sprite à un document de design, jamais au produit (§ 8.5).
const sourceReclamante = (): string => fichiersQuiReclament(DEPOT).map(lis).join('\n');

const PLAFOND_GZIP_OCTETS = 12 * 1024;
const PLAFOND_GLYPHES_CRITIQUES = 8;

const glyphe = (nom: string, corps: string) => ({ nom, viewBox: '0 0 256 256', corps });

const rapportVide = {
  manquants: [],
  orphelins: [],
  horsCritique: [],
  derives: [],
  depassements: [],
};

const classe = (nom: string) => ({ nom, portee: 'classe' as const });

describe('glyphesReferences — ce qu’une source RÉCLAME', () => {
  it('rend les classes ph-* distinctes, triées', () => {
    expect(glyphesReferences('<i class="ph ph-house"></i><i class="ph ph-bell"></i>')).toEqual([
      classe('ph-bell'),
      classe('ph-house'),
    ]);
  });

  it('dédoublonne', () => {
    expect(glyphesReferences('ph-house ph-house ph-house')).toEqual([classe('ph-house')]);
  });

  it('ignore la classe de base ph, qui ne nomme aucun glyphe', () => {
    expect(glyphesReferences('<i class="ph ph-x"></i>')).toEqual([classe('ph-x')]);
  });

  it('lit aussi une référence de sprite, où le glyphe est une ancre', () => {
    expect(glyphesReferences('<use href="/sprite.svg#ph-caret-left" />')).toEqual([
      { nom: 'ph-caret-left', portee: 'externe' },
    ]);
  });

  it('nomme un fragment SANS hôte pour ce qu’il est — une référence LOCALE', () => {
    expect(glyphesReferences('<use href="#ph-caret-left" />')).toEqual([
      { nom: 'ph-caret-left', portee: 'local' },
    ]);
  });

  it('distingue les deux portées du MÊME glyphe — c’est la question, pas le nom', () => {
    expect(
      glyphesReferences('<use href="#ph-x"/><use href="/__v3/sprite.svg#ph-x"/>'),
    ).toEqual([
      { nom: 'ph-x', portee: 'externe' },
      { nom: 'ph-x', portee: 'local' },
    ]);
  });
});

describe('glyphesReferences — la GRAISSE, qui qualifie un glyphe sans en être un', () => {
  it('résout le couple graisse+glyphe en UN glyphe : ph-fill ph-play → ph-fill-play', () => {
    expect(glyphesReferences('<i class="ph-fill ph-play"></i>')).toEqual([
      classe('ph-fill-play'),
    ]);
  });

  it('ne sert PAS la variante creuse à côté — la planche ne réclame que la pleine', () => {
    expect(nomsReclames(glyphesReferences('<i class="ph-fill ph-play"></i>'))).not.toContain(
      'ph-play',
    );
  });

  it('laisse le même glyphe SANS graisse être un glyphe à lui', () => {
    expect(nomsReclames(glyphesReferences('<i class="ph ph-play"></i>'))).toEqual(['ph-play']);
  });

  it('ne réclame rien pour une graisse écrite seule — elle ne nomme aucun tracé', () => {
    expect(glyphesReferences('<i class="ph-fill"></i>')).toEqual([]);
  });
});

describe('cheminDuGlyphe — où le tracé est allé chercher', () => {
  it('prend un glyphe nu dans assets/regular', () => {
    expect(cheminDuGlyphe('ph-play')).toBe(join('regular', 'play.svg'));
  });

  it('prend un glyphe GRAISSÉ dans le dossier de sa graisse, suffixe compris', () => {
    expect(cheminDuGlyphe('ph-fill-play')).toBe(join('fill', 'play-fill.svg'));
  });

  it('ne confond pas un nom composé avec une graisse', () => {
    expect(cheminDuGlyphe('ph-caret-left')).toBe(join('regular', 'caret-left.svg'));
  });
});

// Depuis que l'arbre de la v3 est lu, un nom réclamé peut ne correspondre à
// AUCUN tracé Phosphor — une faute de frappe dans du vrai code. Le générateur
// doit le NOMMER, pas mourir sur un ENOENT : une pile d'appels à la place d'un
// défaut est la même panne muette, déplacée.
describe('tracesExistantes — un nom réclamé n’a pas forcément de tracé', () => {
  it('garde les noms que la source porte', () => {
    expect(
      tracesExistantes({ racineIcones: RACINE_ICONES, noms: ['ph-x', 'ph-fill-play'] }),
    ).toEqual(['ph-x', 'ph-fill-play']);
  });

  it('écarte le nom qui n’existe chez Phosphor dans aucune graisse', () => {
    expect(
      tracesExistantes({ racineIcones: RACINE_ICONES, noms: ['ph-x', 'ph-zorglub'] }),
    ).toEqual(['ph-x']);
  });

  it('laisse ce nom retomber en MANQUANT, un défaut par cause', () => {
    const glyphes = lisGlyphes({
      racineIcones: RACINE_ICONES,
      noms: tracesExistantes({ racineIcones: RACINE_ICONES, noms: ['ph-x', 'ph-zorglub'] }),
    });
    const rapport = audit({
      references: [classe('ph-x'), classe('ph-zorglub')],
      critiques: [],
      sprite: composeSprite(glyphes),
      critical: composeSprite([]),
      glyphes,
      plafondGzipOctets: PLAFOND_GZIP_OCTETS,
      plafondGlyphesCritiques: PLAFOND_GLYPHES_CRITIQUES,
    });

    expect(rapport.manquants).toEqual(['ph-zorglub']);
    expect(rapport.derives).toEqual([]);
  });
});

describe('fichiersQuiReclament — CE QUI réclame, pas seulement la maquette', () => {
  it('lit la planche ET l’arbre de sources de la v3 — le gate du § 8.5 garde le PRODUIT', () => {
    expect(SOURCES_QUI_RECLAMENT).toContain(join('apps', 'web-v3', 'app'));
    expect(SOURCES_QUI_RECLAMENT.some((chemin) => chemin.endsWith('MeeshyWebV3.dc.html'))).toBe(
      true,
    );
  });

  it('rend la planche et les fichiers de app/, jamais un dossier', () => {
    const fichiers = fichiersQuiReclament(DEPOT);

    expect(fichiers.some((chemin) => chemin.endsWith('MeeshyWebV3.dc.html'))).toBe(true);
    expect(fichiers.some((chemin) => chemin.endsWith(join('web-v3', 'app', 'layout.tsx')))).toBe(
      true,
    );
  });

  it('tolère un chemin ABSENT — components/ et lib/ naissent avec leur premier lot', () => {
    expect(fichiersQuiReclament(DEPOT, [join('apps', 'web-v3', 'nexistepas')])).toEqual([]);
  });

  it('ne lit pas les __tests__, dont les glyphes de fixture ne sont réclamés par aucun écran', () => {
    expect(fichiersQuiReclament(DEPOT).some((chemin) => chemin.includes('__tests__'))).toBe(false);
  });

  it('ne lit pas un .svg — un sous-sprite inliné est une RÉPONSE, pas une demande', () => {
    expect(fichiersQuiReclament(DEPOT).some((chemin) => chemin.endsWith('.svg'))).toBe(false);
  });
});

describe('glypheDeFichier — dépouiller un actif Phosphor', () => {
  const source =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M1"/></svg>';

  it("garde le contenu et jette l'enveloppe <svg>", () => {
    expect(glypheDeFichier('ph-house', source).corps).toBe('<path d="M1"/>');
  });

  it('reprend le viewBox du fichier plutôt que de le supposer', () => {
    const carre = source.replace('0 0 256 256', '0 0 24 24');

    expect(glypheDeFichier('ph-house', carre).viewBox).toBe('0 0 24 24');
  });

  it('jette le rectangle de cadrage, qui ne peint rien', () => {
    const cadre = source.replace('<path', '<rect width="256" height="256" fill="none"/><path');

    expect(glypheDeFichier('ph-house', cadre).corps).toBe('<path d="M1"/>');
  });

  it('refuse un fichier sans viewBox plutôt que d’en inventer un', () => {
    expect(() => glypheDeFichier('ph-house', '<svg><path d="M1"/></svg>')).toThrow('viewBox');
  });
});

describe('symbole et composeSprite — le document servi', () => {
  it('porte la classe comme identifiant, pour que <use href="#ph-x"> suffise', () => {
    expect(symbole(glyphe('ph-x', '<path d="M1"/>'))).toContain('id="ph-x"');
  });

  it('pose fill="currentColor" sur le symbole, seul niveau que le clone emporte', () => {
    expect(symbole(glyphe('ph-x', '<path d="M1"/>'))).toContain('fill="currentColor"');
  });

  it('rend un document SVG autonome — il est servi comme fichier', () => {
    const sprite = composeSprite([glyphe('ph-x', '<path d="M1"/>')]);

    expect(sprite.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(sprite.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('garde l’ordre reçu — la génération est déterministe', () => {
    const sprite = composeSprite([
      glyphe('ph-b', '<path d="M2"/>'),
      glyphe('ph-a', '<path d="M1"/>'),
    ]);

    expect(symbolesDuSprite(sprite)).toEqual(['ph-b', 'ph-a']);
  });

  it('fait un aller-retour : ce qui entre se relit', () => {
    const noms = ['ph-house', 'ph-bell', 'ph-x'] as const;
    const sprite = composeSprite(noms.map((nom) => glyphe(nom, `<path d="${nom}"/>`)));

    expect(symbolesDuSprite(sprite)).toEqual([...noms]);
  });
});

describe('mesure — les octets, jamais une estimation', () => {
  const svg = composeSprite([glyphe('ph-x', '<path d="M1"/>')]);

  it('rend le poids brut en octets du document exact', () => {
    expect(mesure(svg).brut).toBe(Buffer.byteLength(svg));
  });

  it('rend le gzip -9, celui que la conception cite', () => {
    expect(mesure(svg).gzip).toBe(gzipSync(Buffer.from(svg), { level: 9 }).length);
  });
});

describe('audit — les quatre défauts qu’un sprite peut avoir', () => {
  const glyphes = [glyphe('ph-house', '<path d="M1"/>'), glyphe('ph-bell', '<path d="M2"/>')];
  const sain = {
    references: [classe('ph-house'), classe('ph-bell')],
    critiques: ['ph-house'],
    sprite: composeSprite(glyphes),
    critical: composeSprite([glyphes[0]!]),
    glyphes,
    plafondGzipOctets: PLAFOND_GZIP_OCTETS,
    plafondGlyphesCritiques: PLAFOND_GLYPHES_CRITIQUES,
  };

  it('rend un rapport vide quand tout tient', () => {
    expect(audit(sain)).toEqual(rapportVide);
    expect(verdict(audit(sain))).toBe(0);
  });

  it('nomme le glyphe RÉCLAMÉ sans <symbol> — la panne muette du § 8.5', () => {
    expect(audit({ ...sain, references: [classe('ph-house'), classe('ph-ghost')] }).manquants).toEqual([
      'ph-ghost',
    ]);
    expect(verdict(audit({ ...sain, references: [classe('ph-ghost')] }))).toBe(1);
  });

  it('nomme le <symbol> que personne ne réclame — un octet servi pour rien', () => {
    expect(audit({ ...sain, references: [classe('ph-house')] }).orphelins).toEqual(['ph-bell']);
  });

  it('nomme la référence LOCALE d’un glyphe absent du sous-sprite inliné', () => {
    const rapport = audit({
      ...sain,
      references: [classe('ph-house'), { nom: 'ph-bell', portee: 'local' }],
    });

    expect(rapport.horsCritique).toEqual(['ph-bell']);
    expect(rapport.manquants).toEqual([]);
    expect(verdict(rapport)).toBe(1);
  });

  it('laisse passer la référence locale d’un glyphe QUI EST inliné', () => {
    expect(
      audit({ ...sain, references: [{ nom: 'ph-house', portee: 'local' }, classe('ph-bell')] })
        .horsCritique,
    ).toEqual([]);
  });

  it('laisse passer la référence EXTERNE du même glyphe — elle atteint sprite.svg', () => {
    expect(
      audit({ ...sain, references: [classe('ph-house'), { nom: 'ph-bell', portee: 'externe' }] })
        .horsCritique,
    ).toEqual([]);
  });

  it('nomme le fichier commité qui a DÉRIVÉ de sa génération', () => {
    expect(audit({ ...sain, sprite: `${sain.sprite}<!-- édité à la main -->` }).derives).toEqual([
      'sprite.svg',
    ]);
  });

  it('nomme le sous-sprite critique qui a dérivé, lui aussi', () => {
    expect(audit({ ...sain, critical: sain.sprite }).derives).toEqual(['critical.svg']);
  });

  it('refuse un glyphe critique absent du sprite complet — le critique en est un SOUS-ensemble', () => {
    expect(audit({ ...sain, critiques: ['ph-ghost'] }).manquants).toContain('ph-ghost');
  });

  it('rougit au-dessus du plafond de POIDS du § 8.5 et dit de combien', () => {
    const rapport = audit({ ...sain, plafondGzipOctets: 10 });

    expect(rapport.depassements).toEqual([
      {
        quoi: 'sprite.svg',
        unite: 'octets gzip',
        valeur: mesure(sain.sprite).gzip,
        plafond: 10,
      },
    ]);
    expect(verdict(rapport)).toBe(1);
  });

  it('rougit au-dessus des 8 glyphes que le § 8.5 autorise à inliner', () => {
    const rapport = audit({ ...sain, plafondGlyphesCritiques: 0 });

    expect(rapport.depassements).toEqual([
      { quoi: 'critical.svg', unite: 'glyphes', valeur: 1, plafond: 0 },
    ]);
  });

  it('rend un rapport lisible qui nomme chaque défaut', () => {
    const texte = formateAudit(
      audit({ ...sain, references: [classe('ph-ghost')], plafondGzipOctets: 10 }),
    );

    expect(texte).toContain('ph-ghost');
    expect(texte).toContain('sprite.svg');
  });

  it('dit POURQUOI une référence locale hors critique est un défaut, pas seulement qu’elle l’est', () => {
    const texte = formateAudit(
      audit({ ...sain, references: [classe('ph-house'), { nom: 'ph-bell', portee: 'local' }] }),
    );

    expect(texte).toContain('LOCAL');
    expect(texte).toContain('ph-bell');
  });
});

describe('le sprite COMMITÉ de packages/icons', () => {
  const references = glyphesReferences(sourceReclamante());
  const reclames = nomsReclames(references);
  const sprite = lis(join(RACINE_ICONES, 'sprite.svg'));
  const critical = lis(join(RACINE_ICONES, 'critical.svg'));
  const critique: { readonly glyphes: readonly { readonly nom: string; readonly pourquoi: string }[] } =
    JSON.parse(lis(join(RACINE_ICONES, 'critique.json')));

  it('porte les 72 glyphes que la v3 réclame — ni plus, ni moins', () => {
    expect(reclames).toHaveLength(72);
    expect(symbolesDuSprite(sprite)).toEqual(reclames);
  });

  // Le bouton LECTURE de la planche est un triangle PLEIN sur quatre surfaces
  // (cercle de reel 68 px, lecteur audio 44 px, story 56 px, bulle vocale 38 px).
  // Servir `ph-play` regular y rendrait un triangle CREUX au centre d'un disque
  // plein : un écart de DISPOSITION, hors de l'écart typographique assumé.
  it('sert la variante PLEINE du bouton lecture, la seule que la planche réclame', () => {
    expect(reclames).toContain('ph-fill-play');
    expect(reclames).not.toContain('ph-play');
  });

  it('prend ce triangle plein dans assets/fill, pas dans assets/regular', () => {
    const [plein] = lisGlyphes({ racineIcones: RACINE_ICONES, noms: ['ph-fill-play'] });
    const [creux] = lisGlyphes({ racineIcones: RACINE_ICONES, noms: ['ph-play'] });

    expect(sprite).toContain(`id="ph-fill-play"`);
    expect(plein?.corps).not.toBe(creux?.corps);
    expect(sprite).not.toContain(creux?.corps ?? 'ph-play introuvable');
  });

  it('vient de @phosphor-icons/core@2.1.1, la version que la conception nomme', () => {
    const manifeste: { readonly version?: string } = JSON.parse(
      lis(join(racineDesTraces(RACINE_ICONES), '..', 'package.json')),
    );

    expect(manifeste.version).toBe('2.1.1');
  });

  it('se REJOUE à l’identique — le fichier commité est la sortie du script', () => {
    const glyphes = lisGlyphes({ racineIcones: RACINE_ICONES, noms: reclames });

    expect(composeSprite(glyphes)).toBe(sprite);
  });

  it('tient sous le plafond de 12 Ko gzip du § 8.5', () => {
    expect(mesure(sprite).gzip).toBeLessThanOrEqual(PLAFOND_GZIP_OCTETS);
  });

  it('ne réclame rien qu’il ne serve, et ne sert rien que personne ne réclame', () => {
    expect(
      audit({
        references,
        critiques: critique.glyphes.map((g) => g.nom),
        sprite,
        critical,
        glyphes: lisGlyphes({ racineIcones: RACINE_ICONES, noms: reclames }),
        plafondGzipOctets: PLAFOND_GZIP_OCTETS,
        plafondGlyphesCritiques: PLAFOND_GLYPHES_CRITIQUES,
      }),
    ).toEqual(rapportVide);
  });
});

describe('le sous-sprite CRITIQUE', () => {
  const critical = lis(join(RACINE_ICONES, 'critical.svg'));
  const sprite = lis(join(RACINE_ICONES, 'sprite.svg'));
  const critique: {
    readonly revise_par?: string;
    readonly glyphes: readonly { readonly nom: string; readonly pourquoi: string }[];
  } = JSON.parse(lis(join(RACINE_ICONES, 'critique.json')));

  it('ne dépasse pas les 8 glyphes que le § 8.5 autorise à inliner', () => {
    expect(critique.glyphes.length).toBeGreaterThan(0);
    expect(critique.glyphes.length).toBeLessThanOrEqual(8);
  });

  it('dit, glyphe par glyphe, POURQUOI il est au-dessus de la ligne de flottaison', () => {
    critique.glyphes.forEach((g) => expect(g.pourquoi.length).toBeGreaterThan(20));
  });

  it('nomme ce qui le révisera — la liste est déclarée, pas devinée', () => {
    expect(critique.revise_par).toEqual(expect.any(String));
  });

  // L0 inline ce sous-sprite dans app/layout.tsx et doit savoir QUELS glyphes il
  // vient d'inliner (sinon `<use href="#…">` vise à l'aveugle — défaut n° 5).
  // Sans l'entrée d'`exports`, le layout recopierait les huit noms : la jumelle
  // que tout le reste du paquet s'applique à éviter.
  it('est ATTEIGNABLE depuis apps/web-v3 — le layout dérive la liste, il ne la recopie pas', () => {
    expect(require.resolve('@meeshy/icons/critique.json')).toBe(
      join(RACINE_ICONES, 'critique.json'),
    );
  });

  it('est la MÊME liste que celle servie par critical.svg, au nom près', () => {
    const declare: { readonly glyphes: readonly { readonly nom: string }[] } = JSON.parse(
      lis(require.resolve('@meeshy/icons/critique.json')),
    );

    expect(symbolesDuSprite(critical)).toEqual(declare.glyphes.map((g) => g.nom));
  });

  it('sert exactement les glyphes déclarés, dans leur ordre', () => {
    expect(symbolesDuSprite(critical)).toEqual(critique.glyphes.map((g) => g.nom));
  });

  it('est un SOUS-ensemble du sprite complet, au symbole près', () => {
    const symbolesDe = (svg: string) =>
      new Map(
        [...svg.matchAll(/<symbol[^>]*id="(ph-[a-z0-9-]+)"[^>]*>(.*?)<\/symbol>/gs)].map(
          ([, id, corps]) => [id, corps],
        ),
      );
    const complet = symbolesDe(sprite);

    symbolesDe(critical).forEach((corps, id) => expect(complet.get(id)).toBe(corps));
  });
});

describe('la MESURE écrite dans budgets-mesures.json', () => {
  const mesures: {
    readonly sprite_phosphor?: {
      readonly commande?: string;
      readonly source?: string;
      readonly sprite_svg?: { readonly brut: number; readonly gzip: number };
      readonly critical_svg?: { readonly brut: number; readonly gzip: number };
    };
  } = JSON.parse(lis(join(__dirname, '..', 'budgets-mesures.json')));

  it('existe — le critère de fin la réclame écrite, jamais inventée', () => {
    expect(mesures.sprite_phosphor).toBeDefined();
  });

  it('porte la commande qui la rejoue', () => {
    expect(mesures.sprite_phosphor?.commande).toEqual(expect.stringContaining('build-sprite'));
  });

  it('dit EXACTEMENT les octets des fichiers commités', () => {
    expect(mesures.sprite_phosphor?.sprite_svg).toEqual(
      mesure(lis(join(RACINE_ICONES, 'sprite.svg'))),
    );
    expect(mesures.sprite_phosphor?.critical_svg).toEqual(
      mesure(lis(join(RACINE_ICONES, 'critical.svg'))),
    );
  });

  it('se recompose par fragmentDeMesures — un seul producteur', () => {
    expect(
      fragmentDeMesures({
        sprite: lis(join(RACINE_ICONES, 'sprite.svg')),
        critical: lis(join(RACINE_ICONES, 'critical.svg')),
      }).sprite_svg,
    ).toEqual(mesures.sprite_phosphor?.sprite_svg);
  });
});

describe('le PLAFOND écrit dans budgets.json', () => {
  const budgets: {
    readonly actifs?: {
      readonly plafonds?: Readonly<
        Record<string, { readonly valeur: number; readonly statut: string; readonly source: string }>
      >;
    };
  } = JSON.parse(lis(join(__dirname, '..', 'budgets.json')));

  it('porte le sprite à 12 Ko gzip, en GATE, avec sa source', () => {
    const plafond = budgets.actifs?.plafonds?.sprite_ko;

    expect(plafond?.valeur).toBe(12);
    expect(plafond?.statut).toBe('GATE');
    expect(plafond?.source).toEqual(expect.stringContaining('8.5'));
  });

  it('borne le sous-sprite inliné par son NOMBRE de glyphes — le § 8.5 ne lui donne aucun poids', () => {
    const plafond = budgets.actifs?.plafonds?.critical_glyphes;

    expect(plafond?.valeur).toBe(8);
    expect(plafond?.statut).toBe('GATE');
    expect(plafond?.source).toEqual(expect.stringContaining('8.5'));
  });

  it('est celui que le témoin oppose au sprite commité — une seule table de plafonds', () => {
    expect(budgets.actifs?.plafonds?.sprite_ko?.valeur).toBe(PLAFOND_GZIP_OCTETS / 1024);
    expect(budgets.actifs?.plafonds?.critical_glyphes?.valeur).toBe(PLAFOND_GLYPHES_CRITIQUES);
  });
});
