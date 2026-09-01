/**
 * Le CLIQUET de #4662 — aucun CINQUIÈME producteur n'écrira
 * `Participant.language` par une autre règle que le site unique.
 *
 * `Participant.language` avait quatre producteurs annoncés et deux règles ; un
 * seul descendait le Prisme. Les trois autres n'avaient AUCUN nom, aucune
 * couche et aucun helper en commun — rien qu'un balayage parti du nom d'une
 * fonction aurait pu voir. Ce cliquet part donc de l'ÉCRITURE Prisma vers la
 * colonne, la seule chose que ces sites partagent.
 *
 * Six choses se prouvent ici, et aucune n'est décorative :
 *
 * 1. **L'inventaire des producteurs hors-site est VIDE** — modulo l'exemption
 *    écrite, il n'y a plus de règle concurrente.
 * 2. **L'inventaire des écritures non remontées est VIDE** hors du gel — une
 *    chaîne qu'on ne sait pas suivre rend `non-resolue`, jamais `conforme` :
 *    le balayage se trompe du côté qui ACCUSE.
 * 3. **Le balayage n'est pas VACUEUX** — un balayage qui ne trouve aucune
 *    écriture passerait au vert pour la pire des raisons (§ « un témoin qui ne
 *    peut pas tomber n'est pas un témoin »). La borne NOMME les écritures
 *    conformes mesurées sur `dev` le 2026-09-01, et le volume total.
 * 4. **Il TOMBE sous la mutation qu'il nomme** — un site conforme RÉEL dont on
 *    remet la forme `systemLanguage ?? 'en'` est nommé. La mutation s'applique
 *    à une COPIE verbatim dans un répertoire temporaire : la production n'est
 *    pas touchée, et la preuve reste REJOUABLE plutôt que d'être une phrase
 *    dans un journal.
 * 5. **Chaque inventaire gelé PORTE quelque chose** — retiré, le balayage nomme
 *    ce qu'il couvrait, et pour la raison qu'il écrit.
 * 6. **Les créations MUETTES sont gelées** — celles qui ne posent aucune
 *    `language` et laissent donc la ligne prendre le défaut `"en"` du schéma.
 *    Hors périmètre de #4662, nommées pour qu'une sixième ne s'ajoute pas en
 *    silence.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterAll } from '@jest/globals';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  balayerEcrituresDeParticipant,
  ecrituresNonResolues,
  fichiersSansLangue,
  producteursHorsSite,
  CREATIONS_SANS_LANGUE,
  ECRITURES_OPAQUES,
  EXEMPTIONS,
} from './participant-language-producer-sweep';

const SRC = join(__dirname, '..');

/** Les écritures CONFORMES mesurées sur `dev` le 2026-09-01. */
const CONFORMES_CONNUES = [
  'routes/conversations/participants-writes.ts',
  'services/messaging/MessagingService.ts',
] as const;

/** 38 écritures Prisma vers `Participant` sur ces sources, même date. */
const ECRITURES_CONNUES = 38;

const bacs: string[] = [];

const bacAvec = (fichiers: Readonly<Record<string, string>>): string => {
  const racine = mkdtempSync(join(tmpdir(), 'participant-lang-'));
  bacs.push(racine);
  for (const [nom, contenu] of Object.entries(fichiers)) {
    const chemin = join(racine, nom);
    mkdirSync(join(chemin, '..'), { recursive: true });
    writeFileSync(chemin, contenu, 'utf8');
  }
  return racine;
};

afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

describe('balayage : tout producteur de `Participant.language` vient du site unique (#4662)', () => {
  it('voit bien les écritures du gateway — un balayage aveugle passerait au vert', () => {
    expect(balayerEcrituresDeParticipant(SRC).length).toBeGreaterThanOrEqual(ECRITURES_CONNUES);
  });

  it('trouve les écritures CONFORMES connues — la borne de non-vacuité', () => {
    const conformes = new Set(
      balayerEcrituresDeParticipant(SRC)
        .filter((e) => e.verdict === 'conforme')
        .map((e) => e.fichier),
    );

    for (const connu of CONFORMES_CONNUES) {
      expect([...conformes]).toContain(connu);
    }
  });

  it("n'a AUCUN producteur hors du site unique", () => {
    expect(producteursHorsSite(SRC)).toEqual([]);
  });

  it("n'a AUCUNE écriture qu'il ne sache remonter — le silence n'est pas un verdict", () => {
    expect(ecrituresNonResolues(SRC)).toEqual([]);
  });
});

describe('le balayage TOMBE sous la mutation qu’il nomme', () => {
  it('nomme un site conforme RÉEL dont on remet la forme `systemLanguage ?? \'en\'`', () => {
    const conforme = readFileSync(
      join(SRC, 'routes/conversations/participants-writes.ts'),
      'utf8',
    );
    const mute = conforme.replace(
      "language: recipientLanguage(userToAdd, 'en'),",
      "language: userToAdd.systemLanguage ?? 'en',",
    );
    expect(mute).not.toBe(conforme);

    const racine = bacAvec({ 'routes/conversations/participants-writes.ts': mute });

    expect(producteursHorsSite(racine)).toEqual([
      expect.stringContaining('routes/conversations/participants-writes.ts'),
      expect.stringContaining('routes/conversations/participants-writes.ts'),
    ]);
    expect(producteursHorsSite(racine)[0]).toContain('userToAdd.systemLanguage');
  });

  it('nomme aussi le site conforme de `MessagingService`, muté de la même façon', () => {
    const conforme = readFileSync(join(SRC, 'services/messaging/MessagingService.ts'), 'utf8');
    const mute = conforme.replace(
      "language: recipientLanguage(user, 'fr'),",
      "language: user.systemLanguage ?? 'fr',",
    );
    expect(mute).not.toBe(conforme);

    const racine = bacAvec({ 'services/messaging/MessagingService.ts': mute });

    expect(producteursHorsSite(racine)).toEqual([
      expect.stringContaining('services/messaging/MessagingService.ts'),
    ]);
  });

  it('voit la colonne à travers un ÉTALEMENT — la forme des deux portes d’ajout', () => {
    const racine = bacAvec({
      'porte.ts': [
        "const champs = { role: 'member', language: user.systemLanguage ?? 'en' };",
        'export const ajouter = async () => prisma.participant.create({ data: { ...champs } });',
      ].join('\n'),
    });

    expect(producteursHorsSite(racine)).toEqual([
      expect.stringContaining('porte.ts'),
    ]);
  });

  it('et il ACCEPTE la même forme dès qu’elle passe par le site unique', () => {
    const racine = bacAvec({
      'porte.ts': [
        "const champs = { role: 'member', language: recipientLanguage(user, 'en') };",
        'export const ajouter = async () => prisma.participant.create({ data: { ...champs } });',
      ].join('\n'),
    });

    expect(producteursHorsSite(racine)).toEqual([]);
    expect(balayerEcrituresDeParticipant(racine)[0]?.verdict).toBe('conforme');
  });

  it('accuse — jamais absout — quand un étalement ne se remonte PAS', () => {
    const racine = bacAvec({
      'porte.ts': [
        "import { CHAMPS } from './nulle-part';",
        'export const ajouter = async () => prisma.participant.create({ data: { ...CHAMPS } });',
      ].join('\n'),
    });

    expect(balayerEcrituresDeParticipant(racine)[0]?.verdict).toBe('non-resolue');
  });
});

describe('chaque inventaire gelé PORTE quelque chose', () => {
  it('l’exemption de `link-admission` couvre un producteur RÉEL, et le dit', () => {
    expect(Object.keys(EXEMPTIONS)).toContain('routes/conversations/link-admission.ts');
    expect(EXEMPTIONS['routes/conversations/link-admission.ts']).toContain('AUCUNE ligne `User`');

    // Retirée, le balayage nomme le site — et la valeur qu'il y trouve.
    const sansExemption = producteursHorsSite(SRC, {});

    expect(sansExemption).toEqual([
      expect.stringContaining('routes/conversations/link-admission.ts'),
    ]);
    expect(sansExemption[0]).toContain('profile.language');
  });

  it('le gel des écritures OPAQUES couvre `ban.ts`, et le dit', () => {
    expect(Object.keys(ECRITURES_OPAQUES)).toEqual(['routes/conversations/ban.ts']);
    expect(ECRITURES_OPAQUES['routes/conversations/ban.ts']).toContain('conversationBanState');

    const sansGel = ecrituresNonResolues(SRC, {});

    expect(sansGel.length).toBeGreaterThan(0);
    for (const nomme of sansGel) {
      expect(nomme).toContain('routes/conversations/ban.ts');
    }
  });
});

describe('les créations MUETTES prennent le défaut `"en"` du schéma — inventaire GELÉ', () => {
  it('sont exactement celles que l’inventaire nomme, et chacune porte sa raison', () => {
    expect(fichiersSansLangue(SRC)).toEqual(Object.keys(CREATIONS_SANS_LANGUE).sort());

    for (const raison of Object.values(CREATIONS_SANS_LANGUE)) {
      expect(raison.length).toBeGreaterThan(40);
    }
  });

  it('et une création MUETTE de plus fait tomber le cliquet', () => {
    const racine = bacAvec({
      'porte-neuve.ts': "export const a = async () => prisma.participant.create({ data: { role: 'member' } });",
    });

    expect(fichiersSansLangue(racine)).toEqual(['porte-neuve.ts']);
    expect(Object.keys(CREATIONS_SANS_LANGUE)).not.toContain('porte-neuve.ts');
  });
});
