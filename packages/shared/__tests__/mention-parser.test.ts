// packages/shared/src/__tests__/mention-parser.test.ts
import { parseMentions, hasMentions, type MentionParticipant } from '../utils/mention-parser';

const participants: MentionParticipant[] = [
  { userId: 'u1', username: 'atabeth',    displayName: 'Andre Tabeth' },
  { userId: 'u2', username: 'jcharlesnm', displayName: 'Jean Charles' },
  { userId: 'u3', username: 'marie',      displayName: 'Marie' },
  { userId: 'u4', username: 'ann_marie',  displayName: 'Ann-Marie Dupont' },
];

describe('parseMentions', () => {
  describe('@displayName matching (avec espaces)', () => {
    it('extrait un displayName simple avec espace après @', () => {
      const result = parseMentions('Salut @Andre Tabeth !', participants);
      expect(result).toEqual(['u1']);
    });

    it('extrait un displayName en fin de string', () => {
      const result = parseMentions('Bonjour @Jean Charles', participants);
      expect(result).toEqual(['u2']);
    });

    it('extrait plusieurs displayNames dans la même phrase', () => {
      const result = parseMentions('@Andre Tabeth et @Jean Charles, rdv demain', participants);
      expect(result).toEqual(expect.arrayContaining(['u1', 'u2']));
      expect(result).toHaveLength(2);
    });

    it('est insensible à la casse', () => {
      const result = parseMentions('@andre tabeth merci', participants);
      expect(result).toEqual(['u1']);
    });

    it('matche le plus long displayName en priorité', () => {
      const result = parseMentions('@Ann-Marie Dupont bravo', participants);
      expect(result).toEqual(['u4']);
    });

    it('matche un displayName simple sans espace', () => {
      const result = parseMentions('@Marie tu viens ?', participants);
      expect(result).toEqual(['u3']);
    });
  });

  describe('@username fallback', () => {
    it('extrait un username classique @username', () => {
      const result = parseMentions('@atabeth tu es là ?', participants);
      expect(result).toEqual(['u1']);
    });

    it('extrait @username même si @DisplayName est aussi présent', () => {
      const result = parseMentions('@Andre Tabeth et @jcharlesnm', participants);
      expect(result).toEqual(expect.arrayContaining(['u1', 'u2']));
    });

    it('retourne handle brut si username non résolu sans participants', () => {
      const result = parseMentions('@unknown_user salut', []);
      expect(result).toEqual(['@unknown_user']);
    });
  });

  describe('deduplication et limites', () => {
    it('déduplique les mentions du même utilisateur', () => {
      const result = parseMentions('@Andre Tabeth et @atabeth', participants);
      expect(result).toEqual(['u1']);
    });

    it('retourne [] pour un contenu vide', () => {
      expect(parseMentions('', participants)).toEqual([]);
    });

    it('retourne [] quand aucune mention', () => {
      expect(parseMentions('Bonjour tout le monde', participants)).toEqual([]);
    });

    it('sans participants, extrait les handles bruts', () => {
      const result = parseMentions('@alice et @bob', []);
      expect(result).toContain('@alice');
    });
  });

  describe('hasMentions', () => {
    it('détecte @ comme mention', () => {
      expect(hasMentions('Salut @Andre Tabeth')).toBe(true);
    });

    it('détecte @username comme mention', () => {
      expect(hasMentions('Salut @alice')).toBe(true);
    });

    it('retourne false sans mention', () => {
      expect(hasMentions('Bonjour')).toBe(false);
    });
  });
});
