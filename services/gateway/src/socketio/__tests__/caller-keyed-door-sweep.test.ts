import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  PORTES_DELIBEREMENT_LARGES,
  PORTES_MESUREES_NON_INSTRUITES,
  PORTES_NON_JUGEABLES_GELEES
} from './caller-keyed-door-inventories';
import {
  balancedParens,
  porteKey,
  sweepCallerKeyedDoors,
  sweepCallerKeyedDoorsIn,
  sweepUnjudgeableCallerKeyedDoors
} from './caller-keyed-door-sweep';

/**
 * **LE CLIQUET DES PORTES À CLÉ D'APPELANT** (#20155).
 *
 * Le cliquet des AUDIENCES écarte délibérément toute clause qui nomme une
 * personne (#20100). La conséquence, mesurée en livrant #20135 : les portes
 * keyées sur l'appelant n'avaient AUCUN témoin, et trois défauts de cette
 * famille ont été livrés en deux jours (#20104, #20135, #20136).
 */

/** Un dossier jetable qui porte les fixtures, balayé comme une racine à lui. */
function dansUnDossier(fichiers: Readonly<Record<string, string>>): { readonly prefix: string; readonly dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'porte-'));
  for (const [nom, contenu] of Object.entries(fichiers)) fs.writeFileSync(path.join(dir, nom), contenu);
  return { prefix: '', dir };
}

describe('le balayage NOMME les trois défauts de référence — la preuve de ROUGE', () => {
  /**
   * Les trois formes sont reprises de l'arbre d'AVANT chacun des trois
   * correctifs, réduites à ce que le balayage lit.
   *
   * Une FIXTURE plutôt que l'arbre par `git show` : le cliquet doit tomber sous
   * la même mutation dans dix ans, quand ces commits auront été réécrits par un
   * filtre d'historique ou que la CI balaiera un export sans `.git`.
   */
  const AVANT_20104 = `
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId },
      include: { participants: { where: { isActive: true, type: 'user' }, select: { userId: true, role: true } } }
    });
    const inviterMember = conversation.participants.find(m => m.userId === inviterId);
    if (!inviterMember) return sendForbidden(reply, 'pas membre');
  `;
  const AVANT_20135 = `
    const link = await fastify.prisma.conversationShareLink.findFirst({
      where: { linkId: publicLinkId },
      include: { conversation: { include: { participants: { where: { userId, isActive: true } } } } }
    });
  `;
  const AVANT_20136 = `
    const conversation = await prisma.conversation.findFirst({
      where: { id },
      select: { participants: { select: { userId: true, role: true, isActive: true } } }
    });
    const appelant = conversation.participants.find(
      (p: { userId: string | null; isActive?: boolean }) => p.userId === userId && p.isActive !== false
    );
  `;

  it.each([
    ['#20104 — la clause est d\'allure AUDIENCE, c\'est le CODE qui en fait une porte', 'a.ts', AVANT_20104, 'prédicat'],
    ['#20135 — la clé de l\'appelant est DANS le `where`', 'b.ts', AVANT_20135, 'clause'],
    ['#20136 — un prédicat sur une projection SANS clause du tout', 'c.ts', AVANT_20136, 'prédicat'],
  ])('%s', (_titre, nom, source, genreAttendu) => {
    const { portes } = sweepCallerKeyedDoorsIn([dansUnDossier({ [nom]: source })]);
    const nues = portes.filter(p => !p.epelleLaLoi);
    expect(nues).toHaveLength(1);
    expect(nues[0].genre).toBe(genreAttendu);
  });

  /**
   * Le ROUGE ne suffit pas : un balayage qui rougit sur TOUT ne garde rien.
   * Les mêmes trois sites, à leur état CORRIGÉ, doivent être verts — sans quoi
   * le cliquet rougirait sur du code juste et serait désactivé en une semaine.
   */
  it.each([
    ['#20104 corrigé — la loi dans la CLAUSE, le prédicat inchangé', 'a.ts', AVANT_20104.replace("{ isActive: true, type: 'user' }", "{ ...PARTICIPATION_VIVANTE, type: 'user' }")],
    ['#20135 corrigé — la loi dans la clause keyée', 'b.ts', AVANT_20135.replace('{ userId, isActive: true }', '{ userId, ...PARTICIPATION_VIVANTE }')],
    ['#20136 corrigé — la loi jugée EN CODE', 'c.ts', AVANT_20136.replace('p.userId === userId && p.isActive !== false', 'p.userId === userId && participationEstVivante(p)')],
  ])('%s ⇒ VERT', (_titre, nom, source) => {
    const { portes } = sweepCallerKeyedDoorsIn([dansUnDossier({ [nom]: source })]);
    expect(portes.filter(p => !p.epelleLaLoi)).toHaveLength(0);
  });

  /**
   * `p.isActive !== false` est l'orthographe que #20136 a CORRIGÉE : elle
   * admet une ligne dont `isActive` est ABSENT. Le témoin l'épingle, parce que
   * c'est la seule forme qui RESSEMBLE à la loi sans l'être.
   */
  it('ne prend PAS `p.isActive !== false` pour la loi', () => {
    const { portes } = sweepCallerKeyedDoorsIn([
      dansUnDossier({ 'd.ts': AVANT_20136.replace('&& p.isActive !== false', '&& p.isActive !== false && p.leftAt === null') })
    ]);
    expect(portes.filter(p => !p.epelleLaLoi)).toHaveLength(1);
  });
});

describe('le lecteur de parenthèses — ce qui rendait les deux prédicats INVISIBLES', () => {
  /**
   * `callArguments` du balayage des audiences cherche la prochaine ACCOLADE.
   * Sur un rappel en flèche sans accolades il rendait le bloc du `if` SUIVANT —
   * du code voisin, plausible, sous lequel le discriminant d'identité rendait
   * `false`. Le balayage publiait « 0 prédicat » comme une propriété du dépôt.
   */
  it('lit un rappel en flèche SANS accolades', () => {
    const src = 'participants.find(m => m.userId === inviterId);\nif (!x) { return sendForbidden(reply, "non"); }';
    expect(balancedParens(src, src.indexOf('('))).toBe('m => m.userId === inviterId');
  });

  it('traverse les guillemets — une parenthèse dans une chaîne ne déséquilibre pas le compte', () => {
    const src = `f(m => m.userId === x && label === "pas membre (encore)")`;
    expect(balancedParens(src, src.indexOf('('))).toBe('m => m.userId === x && label === "pas membre (encore)"');
  });

  it('rend `null` quand l\'index ne désigne pas une parenthèse — jamais un texte voisin', () => {
    expect(balancedParens('abc', 0)).toBeNull();
  });
});

describe('les portes à clé d\'appelant du dépôt', () => {
  const sites = sweepCallerKeyedDoors();
  const nues = sites.filter(s => !s.epelleLaLoi);

  /**
   * Un balayage dont le relevé est VIDE et un dépôt sans porte rendent le même
   * vert. Celui-ci mesure donc d'abord qu'il VOIT quelque chose, et que ses
   * deux discriminants rapportent chacun.
   */
  it('voit les deux genres — un discriminant muet ne garde rien', () => {
    expect(sites.filter(s => s.genre === 'clause').length).toBeGreaterThan(50);
    expect(sites.filter(s => s.genre === 'prédicat').length).toBeGreaterThan(0);
  });

  it('les deux inventaires sont DISJOINTS — « décidé large » et « pas encore instruit » ne sont pas la même phrase', () => {
    const deuxFois = [...PORTES_DELIBEREMENT_LARGES.keys()].filter(k => PORTES_MESUREES_NON_INSTRUITES.has(k));
    expect(deuxFois).toEqual([]);
  });

  /**
   * Une clé INVENTÉE ne gèle rien et se lit pourtant comme une décision
   * instruite. La première version de l'inventaire en portait une
   * (`access-control.ts#clause:0`, qu'aucun balayage ne produit) : ce témoin
   * est né de cette erreur.
   */
  it('chaque clé des deux inventaires désigne un site RÉELLEMENT relevé', () => {
    const reelles = new Set(nues.map(n => porteKey(sites, n)));
    const fantomes = [...PORTES_DELIBEREMENT_LARGES.keys(), ...PORTES_MESUREES_NON_INSTRUITES.keys()]
      .filter(k => !reelles.has(k));
    expect(fantomes).toEqual([]);
  });

  it('le relevé des portes NUES est exactement celui des deux inventaires', () => {
    const attendues = new Set([...PORTES_DELIBEREMENT_LARGES.keys(), ...PORTES_MESUREES_NON_INSTRUITES.keys()]);
    const mesurees = nues.map(n => porteKey(sites, n));
    const entrantes = mesurees.filter(k => !attendues.has(k));
    const sortantes = [...attendues].filter(k => !mesurees.includes(k));
    // ENTRANTE = une porte NEUVE : instruire sa loi, pas ajouter une ligne.
    expect(entrantes).toEqual([]);
    // SORTANTE = une porte RÉPARÉE : retirer sa ligne fait partie du correctif.
    expect(sortantes).toEqual([]);
  });

  it('ce que le balayage ne sait pas juger est PUBLIÉ, jamais tu (#20091)', () => {
    const publies = sweepUnjudgeableCallerKeyedDoors()
      .map(u => `${u.file}#${u.genre}/${u.raison}`)
      .sort();
    expect(publies).toEqual([...PORTES_NON_JUGEABLES_GELEES].sort());
  });
});
