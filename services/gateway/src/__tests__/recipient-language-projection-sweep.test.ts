/**
 * Le CLIQUET de #4642 — plus aucun appelant de la descente de CADRAGE n'est
 * alimenté par une projection ÉTROITE.
 *
 * `AuthService.resendVerificationEmail` importait la SSOT, l'appelait
 * correctement, et chargeait `systemLanguage` SEUL : les trois autres rangs
 * arrivaient `undefined`, donc « non réglés », donc le repli `'fr'` pour tout
 * lecteur dont la langue applicative vit ailleurs qu'au rang 1. **Un balayage
 * qui cherche le nom du helper rend ce site conforme.** Un site converti à
 * moitié — l'appel adopté, la projection gardée — y est indiscernable d'un site
 * juste ; c'est exactement ce qui a produit ce défaut.
 *
 * Ce cliquet porte donc sur le COUPLE `select` / appel. Sa mécanique et ses
 * limites sont documentées dans `recipient-language-projection-sweep.ts`.
 *
 * Cinq choses se prouvent ici, et aucune n'est décorative :
 *
 * 1. **L'inventaire des projections étroites est VIDE** — il n'y a pas de
 *    descente à moitié alimentée qu'une raison écrite justifierait de garder.
 * 2. **L'inventaire des chaînes non remontées est VIDE** — une chaîne qu'on ne
 *    sait pas suivre rend `non-resolue`, jamais `complete` : le balayage se
 *    trompe du côté qui accuse, et un site qu'il ne sait pas lire doit être
 *    OUVERT ou EXEMPTÉ avec sa raison, jamais laissé dans le silence.
 * 3. **Le balayage n'est pas VACUEUX** — un balayage qui ne trouve aucun appel
 *    passerait au vert pour la pire des raisons (§ « un témoin qui ne peut pas
 *    tomber n'est pas un témoin »). La borne NOMME les treize fichiers
 *    appelants mesurés sur `dev` le 2026-09-01, et leurs 23 appels.
 * 4. **Il TOMBE sous la mutation qu'il nomme** — un site conforme RÉEL dont on
 *    retire `...RECIPIENT_LANG_SELECT` est nommé, avec les trois colonnes
 *    perdues. La mutation s'applique à une COPIE verbatim dans un répertoire
 *    temporaire : le fichier de production n'est pas touché, et la preuve reste
 *    rejouable plutôt que d'être une phrase dans un journal.
 * 5. **L'exemption PORTE quelque chose** — retirée, le balayage nomme le
 *    fichier qu'elle couvre, et pour la raison qu'elle écrit.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterAll } from '@jest/globals';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  balayerAppelsDeCadrage,
  chainesNonRemontees,
  projectionsEtroites,
  COLONNES_DU_PRISME,
  EXEMPTIONS,
} from './recipient-language-projection-sweep';

const SRC = join(__dirname, '..');

/** Les treize fichiers de production qui APPELLENT, mesurés sur `dev` le 2026-09-01. */
const APPELANTS_CONNUS = [
  'jobs/broadcast-inapp-sender.ts',
  'jobs/broadcast-sender.ts',
  'jobs/notification-digest.ts',
  'routes/invitations.ts',
  'routes/me/delete-account.ts',
  'routes/users/contact-change.ts',
  'routes/users/contact-changes.ts',
  'services/AuthService.ts',
  'services/MagicLinkService.ts',
  'services/MaintenanceService.ts',
  'services/PasswordResetService.ts',
  'services/messaging/MessagingService.ts',
  'services/notifications/NotificationService.ts',
];

/** 23 appels sur ces treize fichiers — un fichier peut en porter jusqu'à trois. */
const APPELS_CONNUS = 23;

const bacs: string[] = [];

const bacAvec = (fichiers: Readonly<Record<string, string>>): string => {
  const racine = mkdtempSync(join(tmpdir(), 'recipient-lang-'));
  bacs.push(racine);
  for (const [nom, contenu] of Object.entries(fichiers)) {
    const chemin = join(racine, nom);
    mkdirSync(join(chemin, '..'), { recursive: true });
    writeFileSync(chemin, contenu, 'utf8');
  }
  return racine;
};

/** La SSOT, réduite à ce que la résolution d'un étalement en lit. */
const SSOT_MINIMALE = [
  'export const RECIPIENT_LANG_SELECT = {',
  ...COLONNES_DU_PRISME.map((c) => `  ${c}: true,`),
  '} as const;',
].join('\n');

afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

describe('balayage : tout appelant du cadrage charge les quatre colonnes (#4642)', () => {
  it('voit bien les sources du gateway — un balayage aveugle passerait au vert', () => {
    expect(balayerAppelsDeCadrage(SRC).length).toBeGreaterThanOrEqual(APPELS_CONNUS);
  });

  it('trouve les treize fichiers APPELANTS connus — la borne de non-vacuité', () => {
    const appelants = new Set(balayerAppelsDeCadrage(SRC).map((appel) => appel.fichier));

    for (const connu of APPELANTS_CONNUS) {
      expect([...appelants]).toContain(connu);
    }
  });

  it("n'a AUCUN appel alimenté par une projection étroite", () => {
    expect(projectionsEtroites(SRC)).toEqual([]);
  });

  it("n'a AUCUNE chaîne qu'il ne sache remonter — le silence n'est pas un verdict", () => {
    expect(chainesNonRemontees(SRC)).toEqual([]);
  });

  it('TOMBE quand on retire `...RECIPIENT_LANG_SELECT` d’un site conforme RÉEL', () => {
    const conforme = readFileSync(join(SRC, 'routes/invitations.ts'), 'utf8');
    expect(conforme).toContain('...RECIPIENT_LANG_SELECT');

    const sain = bacAvec({
      'routes/invitations.ts': conforme,
      'utils/recipient-language.ts': SSOT_MINIMALE,
    });
    expect(projectionsEtroites(sain)).toEqual([]);

    const mutant = bacAvec({
      'routes/invitations.ts': conforme.replace(/\.\.\.RECIPIENT_LANG_SELECT/g, 'systemLanguage: true'),
      'utils/recipient-language.ts': SSOT_MINIMALE,
    });

    expect(projectionsEtroites(mutant)).toEqual([
      'routes/invitations.ts — recipientLanguage(user) sans regionalLanguage, customDestinationLanguage, deviceLocale',
    ]);
  });

  it("l'exemption de la SSOT PORTE quelque chose — retirée, le balayage la nomme", () => {
    expect(Object.keys(EXEMPTIONS)).toEqual(['utils/recipient-language.ts']);

    const sansExemption = balayerAppelsDeCadrage(SRC, {}).filter(
      (appel) => appel.fichier === 'utils/recipient-language.ts',
    );

    // La raison écrite dans l'exemption est exactement ce que le balayage
    // constate : les receveurs y sont les PARAMÈTRES de la SSOT, dont la
    // projection appartient à ses appelants.
    expect(sansExemption.length).toBeGreaterThan(0);
    expect(sansExemption.every((appel) => appel.verdict === 'non-resolue')).toBe(true);
    expect(chainesNonRemontees(SRC, {})).not.toEqual([]);
  });
});

describe('ce que la remontée sait suivre, et ce qu’elle refuse de deviner', () => {
  it('suit un étalement, une relation, une itération et un paramètre local', () => {
    const racine = bacAvec({
      'utils/recipient-language.ts': SSOT_MINIMALE,
      'etalement.ts': [
        "import { RECIPIENT_LANG_SELECT, recipientLanguage } from './utils/recipient-language';",
        'export async function a(prisma) {',
        '  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, ...RECIPIENT_LANG_SELECT } });',
        "  return recipientLanguage(user, 'fr');",
        '}',
      ].join('\n'),
      'relation.ts': [
        "import { RECIPIENT_LANG_SELECT, recipientLanguage } from './utils/recipient-language';",
        'export async function b(prisma) {',
        '  const jeton = await prisma.token.findUnique({ where: { h }, include: { user: { select: { id: true, ...RECIPIENT_LANG_SELECT } } } });',
        '  const user = jeton.user;',
        "  return recipientLanguage(user, 'fr');",
        '}',
      ].join('\n'),
      'iteration.ts': [
        "import { RECIPIENT_LANG_SELECT, recipientLanguage } from './utils/recipient-language';",
        'export async function c(prisma) {',
        '  const users = await prisma.user.findMany({ select: { id: true, ...RECIPIENT_LANG_SELECT } });',
        '  for (const user of users) {',
        "    envoyer(recipientLanguage(user, 'fr'));",
        '  }',
        '}',
      ].join('\n'),
      'parametre.ts': [
        "import { RECIPIENT_LANG_SELECT, recipientLanguage } from './utils/recipient-language';",
        'const envoyer = (destinataire) => {',
        "  return recipientLanguage(destinataire, 'fr');",
        '};',
        'export async function d(prisma) {',
        '  const user = await prisma.user.findFirst({ select: { ...RECIPIENT_LANG_SELECT } });',
        '  return envoyer(user);',
        '}',
      ].join('\n'),
    });

    expect(balayerAppelsDeCadrage(racine).map((a) => [a.fichier, a.verdict])).toEqual([
      ['etalement.ts', 'complete'],
      ['iteration.ts', 'complete'],
      ['parametre.ts', 'complete'],
      ['relation.ts', 'complete'],
    ]);
  });

  it('rend `complete` une lecture SANS select — Prisma y sert tous les scalaires', () => {
    const racine = bacAvec({
      'nu.ts': [
        "import { recipientLanguage } from './utils/recipient-language';",
        'export async function e(prisma) {',
        '  const user = await prisma.user.findUnique({ where: { id } });',
        "  return recipientLanguage(user, 'fr');",
        '}',
      ].join('\n'),
    });

    expect(balayerAppelsDeCadrage(racine).map((a) => a.verdict)).toEqual(['complete']);
  });

  it('nomme la PIRE des projections quand une fonction locale est appelée deux fois', () => {
    // Une fonction servie une fois depuis une projection complète et une fois
    // depuis une projection étroite sert la moitié de ses destinataires dans la
    // mauvaise langue : le verdict est celui du pire appel, jamais du meilleur.
    const racine = bacAvec({
      'utils/recipient-language.ts': SSOT_MINIMALE,
      'deux-appels.ts': [
        "import { RECIPIENT_LANG_SELECT, recipientLanguage } from './utils/recipient-language';",
        'const envoyer = (destinataire) => recipientLanguage(destinataire, "fr");',
        'export async function f(prisma) {',
        '  const complet = await prisma.user.findFirst({ select: { ...RECIPIENT_LANG_SELECT } });',
        '  envoyer(complet);',
        '  const etroit = await prisma.user.findFirst({ select: { systemLanguage: true } });',
        '  envoyer(etroit);',
        '}',
      ].join('\n'),
    });

    expect(projectionsEtroites(racine)).toEqual([
      'deux-appels.ts — recipientLanguage(destinataire) sans regionalLanguage, customDestinationLanguage, deviceLocale',
    ]);
  });

  it('refuse de conclure sur une chaîne qu’il ne sait pas remonter', () => {
    const racine = bacAvec({
      'opaque.ts': [
        "import { recipientLanguage } from './utils/recipient-language';",
        'export async function g(charger) {',
        '  const user = charger(id);',
        "  return recipientLanguage(user, 'fr');",
        '}',
      ].join('\n'),
    });

    expect(balayerAppelsDeCadrage(racine).map((a) => a.verdict)).toEqual(['non-resolue']);
    expect(chainesNonRemontees(racine)).toHaveLength(1);
  });

  it("ne se laisse pas déclarer conforme par le seul NOM d'une constante de projection", () => {
    // Le piège exact que ce balayage doit refuser : une jumelle privée du
    // `select` partagé, à qui il manque une colonne. Reconnaître le NOM
    // `RECIPIENT_LANG_SELECT` comme valant quatre colonnes referait le piège du
    // helper un cran plus bas — un NOM qui atteste à la place d'une donnée.
    const racine = bacAvec({
      'jumelle.ts': [
        "import { recipientLanguage } from './utils/recipient-language';",
        'const RECIPIENT_LANG_SELECT = { systemLanguage: true, regionalLanguage: true };',
        'export async function h(prisma) {',
        '  const user = await prisma.user.findFirst({ select: { ...RECIPIENT_LANG_SELECT } });',
        "  return recipientLanguage(user, 'fr');",
        '}',
      ].join('\n'),
    });

    expect(projectionsEtroites(racine)).toEqual([
      'jumelle.ts — recipientLanguage(user) sans customDestinationLanguage, deviceLocale',
    ]);
  });
});
