/**
 * Les quatre clés de protection ont UN site de définition, et tout producteur
 * les en importe (#17177).
 *
 * ## Pourquoi un cliquet, et pas une phrase
 *
 * Le lot de #17177 a extrait ces quatre valeurs en constantes parce que son
 * SECOND VERROU compare la clé servie à l'une d'elles : `envelopeSurvivesProtectionLock`
 * laisse passer le chiffré de l'appareil sous la clé du CHIFFREMENT et le
 * retient sous toute autre. Il a ensuite argumenté sa sûreté par
 * « `protectedPreview` est l'unique producteur du dépôt » — **et c'était faux au
 * moment où la phrase a été écrite** : `messageMentions.ts` composait son masque
 * fail-closed avec le littéral `'notification.hidden_message'` écrit à la main,
 * dans le fichier même qui gouverne le chemin d'édition.
 *
 * Deux hasards heureux sauvaient la situation : ce littéral n'atteignait pas
 * `createNotification` (le chemin d'édition ne transmet pas la clé), et la
 * valeur était de toute façon une clé CONNUE et RETENANTE. Le correctif évident
 * du chemin d'édition — transmettre la clé — l'aurait routée dans le verrou, où
 * une divergence d'un caractère la rendrait INCONNUE : direction sûre pour
 * l'enveloppe, mais le placeholder de la NSE perdrait sa localisation, sans
 * qu'aucun témoin ne rougisse.
 *
 * > **Une affirmation d'unicité se garde par un balayage, jamais par une
 * > phrase.** Celle-ci était fausse le jour de son écriture, dans trois
 * > doc-comments et un journal à la fois, et aucun gate ne pouvait la
 * > contredire.
 *
 * Quand ce cliquet tombe, la réparation est d'importer la constante — il n'y a
 * pas de littéral légitime à porter dans un inventaire.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import {
  BLURRED_MESSAGE_LOC_KEY,
  ENCRYPTED_MESSAGE_LOC_KEY,
  EPHEMERAL_MESSAGE_LOC_KEY,
  VIEW_ONCE_MESSAGE_LOC_KEY,
} from '../services/notifications/notification-preview';

/** Le site de DÉFINITION, seul autorisé à écrire ces valeurs en littéral. */
const DEFINITION_SITE = 'services/notifications/notification-preview.ts';

const SRC = join(__dirname, '..');

const PROTECTION_LOC_KEYS = [
  EPHEMERAL_MESSAGE_LOC_KEY,
  VIEW_ONCE_MESSAGE_LOC_KEY,
  BLURRED_MESSAGE_LOC_KEY,
  ENCRYPTED_MESSAGE_LOC_KEY,
] as const;

const sourceFiles = (dir: string): readonly string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' || entry === 'node_modules' ? [] : sourceFiles(full);
    }
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : [];
  });

const relative = (absolute: string): string => absolute.slice(SRC.length + 1);

const literalWriters = (): readonly string[] =>
  sourceFiles(SRC)
    .filter((file) => relative(file) !== DEFINITION_SITE)
    .filter((file) => {
      const text = readFileSync(file, 'utf8');
      return PROTECTION_LOC_KEYS.some((key) => text.includes(`'${key}'`) || text.includes(`"${key}"`));
    })
    .map(relative);

describe('clés de protection — un seul site les écrit en littéral', () => {
  it('le balayage voit bien le site de DÉFINITION — sans quoi un vide ne prouve rien', () => {
    // Une garde négative dont le balayage rend `[]` reste verte : celle-ci
    // prouve d'abord qu'elle lit le fichier dont elle exempte le contenu.
    const definition = readFileSync(join(SRC, DEFINITION_SITE), 'utf8');

    for (const key of PROTECTION_LOC_KEYS) {
      expect(definition).toContain(`'${key}'`);
    }
    expect(sourceFiles(SRC).map(relative)).toContain(DEFINITION_SITE);
  });

  it('aucun autre fichier de production ne les écrit à la main', () => {
    expect(literalWriters()).toEqual([]);
  });

  it('les quatre valeurs sont distinctes — une collision ferait passer un placeholder pour un autre', () => {
    expect(new Set(PROTECTION_LOC_KEYS).size).toBe(PROTECTION_LOC_KEYS.length);
  });
});
