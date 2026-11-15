/**
 * Les gabarits de libellé des succès (#5759).
 *
 * Le témoin le plus important n'est pas qu'une traduction existe, mais que la
 * table soit COMPLÈTE : une famille sans gabarit rendrait `null`, donc un
 * succès invisible — une panne silencieuse, la pire espèce.
 */

import { describe, it, expect } from 'vitest';
import { achievementLabel, ACHIEVEMENT_LABELS, ACHIEVEMENT_LABELS_ONE } from '../utils/achievement-labels.js';
import { ACHIEVEMENT_FAMILIES, familyId } from '../types/achievement-families.js';
import { NOTIFICATION_LANGUAGES, type NotificationLanguage } from '../utils/notification-strings.js';

describe('la table est complète — aucune famille sans gabarit', () => {
  it('couvre les huit langues pour CHAQUE famille déclarée', () => {
    const manques: string[] = [];
    for (const langue of NOTIFICATION_LANGUAGES) {
      for (const famille of ACHIEVEMENT_FAMILIES) {
        if (ACHIEVEMENT_LABELS[langue][familyId(famille)] === undefined) {
          manques.push(`${langue}/${familyId(famille)}`);
        }
      }
    }
    expect(manques).toEqual([]);
  });

  it('n\'a aucun gabarit ORPHELIN — une entrée sans famille est du poids mort', () => {
    const declarees = new Set(ACHIEVEMENT_FAMILIES.map(familyId));
    const orphelins: string[] = [];
    for (const langue of NOTIFICATION_LANGUAGES) {
      for (const cle of Object.keys(ACHIEVEMENT_LABELS[langue])) {
        if (!declarees.has(cle)) orphelins.push(`${langue}/${cle}`);
      }
    }
    expect(orphelins).toEqual([]);
  });

  it('porte le marqueur {n} dans chaque gabarit — sans lui le palier disparaît', () => {
    const sansMarqueur: string[] = [];
    for (const langue of NOTIFICATION_LANGUAGES) {
      for (const [cle, gabarit] of Object.entries(ACHIEVEMENT_LABELS[langue])) {
        if (!gabarit.includes('{n}')) sansMarqueur.push(`${langue}/${cle}`);
      }
    }
    expect(sansMarqueur).toEqual([]);
  });
});

describe('le libellé sert la langue du LECTEUR, chiffres compris', () => {
  const conversationTaille = ACHIEVEMENT_FAMILIES.find(
    (f) => familyId(f) === 'conversation.join.size',
  )!;

  it('formate le nombre SELON la langue', () => {
    // Servir « 1000 » brut ferait lire un catalogue traduit avec des chiffres
    // qui ne le sont pas — l'incohérence que la face « cadrage » du Prisme
    // interdit.
    //
    // Le séparateur français est une ESPACE FINE INSÉCABLE (U+202F), pas une
    // espace ordinaire : l'assertion normalise les espaces plutôt que d'épingler
    // un caractère qu'ICU peut faire évoluer d'une version à l'autre.
    const espaces = (texte: string | null) => (texte ?? '').replace(/[\s\u202f\u00a0]/g, ' ');
    expect(espaces(achievementLabel('fr', conversationTaille, 1000))).toContain('1 000');
    expect(achievementLabel('en', conversationTaille, 1000)).toContain('1,000');
    expect(achievementLabel('de', conversationTaille, 1000)).toContain('1.000');
  });

  it('rend les chiffres arabes en arabe', () => {
    const libelle = achievementLabel('ar', conversationTaille, 1000);
    expect(libelle).not.toContain('1000');
    expect(libelle).toMatch(/[٠-٩]/);
  });

  it('replie une langue inconnue plutôt que d\'échouer', () => {
    expect(achievementLabel('xx-YY', conversationTaille, 10)).toBe(
      achievementLabel('fr', conversationTaille, 10),
    );
  });

  it('rend null pour une famille hors catalogue — jamais une clé affichée', () => {
    const inconnue = { section: 'cercles', subject: 'ovni', verb: 'zap', scale: 'count', baseDifficulty: 1 } as never;
    expect(achievementLabel('fr', inconnue, 10)).toBeNull();
  });
});

describe('le premier palier de chaque famille de VOLUME s\'accorde au singulier (#5832)', () => {
  const LANGUES_QUI_ACCORDENT: readonly NotificationLanguage[] = ['fr', 'en', 'es', 'pt', 'de', 'it'];
  const FAMILLES_VOLUME = ACHIEVEMENT_FAMILIES.filter((f) => f.scale === 'count');

  it('couvre les dix-huit familles de volume dans les six langues qui accordent', () => {
    // 18 familles × 6 langues = 108 chaînes, pas 180 : les familles d'AMPLEUR
    // (scale 'size') ne descendent jamais à 1, donc n'ont pas besoin d'accord.
    expect(FAMILLES_VOLUME).toHaveLength(18);
    const manques: string[] = [];
    for (const langue of LANGUES_QUI_ACCORDENT) {
      for (const famille of FAMILLES_VOLUME) {
        if (ACHIEVEMENT_LABELS_ONE[langue]?.[familyId(famille)] === undefined) {
          manques.push(`${langue}/${familyId(famille)}`);
        }
      }
    }
    expect(manques).toEqual([]);
  });

  it('porte le marqueur {n} dans chaque forme au singulier', () => {
    const sansMarqueur: string[] = [];
    for (const langue of LANGUES_QUI_ACCORDENT) {
      for (const [cle, gabarit] of Object.entries(ACHIEVEMENT_LABELS_ONE[langue] ?? {})) {
        if (!gabarit.includes('{n}')) sansMarqueur.push(`${langue}/${cle}`);
      }
    }
    expect(sansMarqueur).toEqual([]);
  });

  it('ne définit aucune forme pour ar / zh-Hans — déjà justes sans accord (#5832)', () => {
    expect(ACHIEVEMENT_LABELS_ONE.ar).toBeUndefined();
    expect(ACHIEVEMENT_LABELS_ONE['zh-Hans']).toBeUndefined();
  });

  const messageSend = ACHIEVEMENT_FAMILIES.find((f) => familyId(f) === 'message.send.count')!;

  it.each([
    ['fr', '1 message envoyé'],
    ['en', '1 message sent'],
    ['es', '1 mensaje enviado'],
    ['pt', '1 mensagem enviada'],
    ['de', '1 Nachricht gesendet'],
    ['it', '1 messaggio inviato'],
  ] as const)('achievementLabel(%s, message.send.count, 1) accorde le singulier', (langue, attendu) => {
    expect(achievementLabel(langue, messageSend, 1)).toBe(attendu);
  });

  it('laisse le pluriel intact à partir du palier 10', () => {
    expect(achievementLabel('fr', messageSend, 10)).toBe('10 messages envoyés');
    expect(achievementLabel('en', messageSend, 10)).toBe('10 messages sent');
  });

  it('un succès d\'AMPLEUR au palier 1 (hors catalogue réel) n\'est pas accordé — seul le VOLUME l\'est', () => {
    const conversationTaille = ACHIEVEMENT_FAMILIES.find((f) => familyId(f) === 'conversation.join.size')!;
    expect(achievementLabel('fr', conversationTaille, 1)).toBe('Conversation de 1 membres');
  });
});
