import { reactionEstCoherente, dedupliquerReactions } from '../../agents/reaction-coherence';

/**
 * Mesuré en production le 2026-09-08 sur `68f2a81417a557e8ce4ddfbb` :
 * le message « D'accord » — deux mots, un acquiescement — a reçu 🤔, et deux
 * agents distincts y ont posé 🙌 à la MÊME minute. Les réactions ne passaient
 * par aucun contrôle : `[QualityGate] … 5 reactions pass-through` (#5666).
 */
describe('reactionEstCoherente() — un emoji ne contredit pas son message', () => {
  describe('le doute sur un acquiescement est un contresens', () => {
    it.each(['🤔', '😕', '🤨', '❓', '🤷'])('%s sur « D\'accord » est refusé', (emoji) => {
      expect(reactionEstCoherente(emoji, "D'accord").ok).toBe(false);
    });

    it.each(["D'accord", 'D’accord', 'Ok', 'OK !', 'oui', 'Merci', 'Parfait', 'Ça marche', 'Compris.'])(
      'refuse 🤔 sur « %s »',
      (contenu) => {
        expect(reactionEstCoherente('🤔', contenu).ok).toBe(false);
      },
    );

    it('dit POURQUOI il refuse', () => {
      const verdict = reactionEstCoherente('🤔', "D'accord");
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.reason).toMatch(/acquiescement|doute/i);
    });
  });

  describe('le doute reste permis là où il a du sens', () => {
    it('accepte 🤔 sur une question', () => {
      expect(reactionEstCoherente('🤔', 'Vous pensez vraiment que ça peut marcher à cette échelle ?').ok).toBe(true);
    });

    it('accepte 🤔 sur un propos substantiel', () => {
      expect(
        reactionEstCoherente('🤔', "Je ne suis pas convaincu que migrer maintenant soit le bon moment pour l'équipe").ok,
      ).toBe(true);
    });

    it('refuse 🤔 sur un message très court sans question', () => {
      expect(reactionEstCoherente('🤔', 'À demain').ok).toBe(false);
    });
  });

  describe('la tristesse ne répond pas à une bonne nouvelle', () => {
    it.each(['😢', '😭', '💔'])('%s sur « Excellent week-end à vous » est refusé', (emoji) => {
      expect(reactionEstCoherente(emoji, 'Excellent week-end à vous').ok).toBe(false);
    });

    it('accepte 😢 sur une annonce triste', () => {
      expect(reactionEstCoherente('😢', "Je suis vraiment désolé d'apprendre cette nouvelle, c'est terrible").ok).toBe(true);
    });
  });

  describe('l\'approbation reste libre', () => {
    it.each(['👍', '❤️', '💯', '🔥', '🙌', '😂'])('%s sur un acquiescement passe', (emoji) => {
      expect(reactionEstCoherente(emoji, "D'accord").ok).toBe(true);
    });

    it('laisse passer un emoji inconnu du garde', () => {
      expect(reactionEstCoherente('🦔', "D'accord").ok).toBe(true);
    });
  });

  describe('un message absent ne fait pas échouer le garde', () => {
    it('laisse passer quand le contenu cible est introuvable', () => {
      expect(reactionEstCoherente('🤔', undefined).ok).toBe(true);
    });

    it('laisse passer sur un média sans texte', () => {
      expect(reactionEstCoherente('🤔', '').ok).toBe(true);
    });
  });
});

describe('dedupliquerReactions() — deux agents ne posent pas le même emoji au même endroit', () => {
  const reaction = (asUserId: string, targetMessageId: string, emoji: string) => ({
    type: 'reaction' as const,
    asUserId,
    targetMessageId,
    emoji,
    delaySeconds: 0,
    delayCategory: 'immediate' as const,
    topicCategory: 'divers',
    topicHash: 'h',
  });

  it('retient une seule fois le même emoji sur le même message', () => {
    const garde = dedupliquerReactions([
      reaction('u1', 'm1', '🙌'),
      reaction('u2', 'm1', '🙌'),
    ]);

    expect(garde).toHaveLength(1);
    expect(garde[0].asUserId).toBe('u1');
  });

  it('garde des emojis DIFFÉRENTS sur le même message', () => {
    expect(dedupliquerReactions([reaction('u1', 'm1', '🙌'), reaction('u2', 'm1', '🔥')])).toHaveLength(2);
  });

  it('garde le même emoji sur des messages DIFFÉRENTS', () => {
    expect(dedupliquerReactions([reaction('u1', 'm1', '🙌'), reaction('u2', 'm2', '🙌')])).toHaveLength(2);
  });

  it('empêche un même agent de réagir deux fois au même message', () => {
    const garde = dedupliquerReactions([
      reaction('u1', 'm1', '🙌'),
      reaction('u1', 'm1', '🔥'),
    ]);

    expect(garde).toHaveLength(1);
  });

  it('rend une liste vide inchangée', () => {
    expect(dedupliquerReactions([])).toEqual([]);
  });
});
