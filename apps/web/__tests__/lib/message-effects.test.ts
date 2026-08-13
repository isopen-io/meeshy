import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import {
  resolveMessageEffectPlan,
  messageEffectClassNames,
  messageEffectOverlays,
} from '@/lib/message-effects';

const moving = { reduceMotion: false };

describe('resolveMessageEffectPlan', () => {
  it('plays the appearance effect of a displayed message', () => {
    const plan = resolveMessageEffectPlan(MESSAGE_EFFECT_FLAGS.CONFETTI, moving);
    expect(plan.appearance).toEqual(['confetti']);
    expect(plan.isEmpty).toBe(false);
  });

  // L'effet suit l'horloge d'AFFICHAGE — celle du flou qui se déclenche à
  // l'ouverture — et non celle de RÉCEPTION, qui pilote le compteur éphémère.
  // Le plan ne porte donc aucune mémoire de lecture.
  it('carries no playback memory, so each display replays', () => {
    const flags = MESSAGE_EFFECT_FLAGS.CONFETTI | MESSAGE_EFFECT_FLAGS.SHAKE;
    const firstDisplay = resolveMessageEffectPlan(flags, moving);
    const secondDisplay = resolveMessageEffectPlan(flags, moving);

    expect(secondDisplay).toEqual(firstDisplay);
    expect(secondDisplay.appearance).toEqual(['shake', 'confetti']);
  });

  it('reports empty for a message without effects so callers skip the wrapper', () => {
    expect(resolveMessageEffectPlan(0, moving).isEmpty).toBe(true);
    expect(resolveMessageEffectPlan(undefined, moving).isEmpty).toBe(true);
    expect(resolveMessageEffectPlan(null, moving).isEmpty).toBe(true);
    expect(resolveMessageEffectPlan(NaN, moving).isEmpty).toBe(true);
  });

  it('ignores lifecycle-only flags — they are not visual effects', () => {
    const lifecycle =
      MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.BLURRED | MESSAGE_EFFECT_FLAGS.VIEW_ONCE;
    expect(resolveMessageEffectPlan(lifecycle, moving).isEmpty).toBe(true);
  });

  it('mixes appearance and persistent effects without losing either', () => {
    const plan = resolveMessageEffectPlan(
      MESSAGE_EFFECT_FLAGS.ZOOM | MESSAGE_EFFECT_FLAGS.GLOW | MESSAGE_EFFECT_FLAGS.SPARKLE,
      moving,
    );
    expect(plan.appearance).toEqual(['zoom']);
    expect(plan.persistent).toEqual(['glow', 'sparkle']);
  });

  describe('reduced motion', () => {
    const reduced = { reduceMotion: true };

    it('suppresses every appearance effect', () => {
      const all =
        MESSAGE_EFFECT_FLAGS.SHAKE |
        MESSAGE_EFFECT_FLAGS.ZOOM |
        MESSAGE_EFFECT_FLAGS.EXPLODE |
        MESSAGE_EFFECT_FLAGS.CONFETTI |
        MESSAGE_EFFECT_FLAGS.FIREWORKS |
        MESSAGE_EFFECT_FLAGS.WAOO;
      expect(resolveMessageEffectPlan(all, reduced).appearance).toEqual([]);
    });

    it('keeps statically meaningful persistent effects, rendered fixed', () => {
      const plan = resolveMessageEffectPlan(
        MESSAGE_EFFECT_FLAGS.GLOW | MESSAGE_EFFECT_FLAGS.RAINBOW,
        reduced,
      );
      expect(plan.persistent).toEqual(['glow', 'rainbow']);
      expect(plan.animatesPersistent).toBe(false);
    });

    it('drops pure-motion effects rather than freezing them into nonsense', () => {
      const plan = resolveMessageEffectPlan(
        MESSAGE_EFFECT_FLAGS.PULSE | MESSAGE_EFFECT_FLAGS.SPARKLE,
        reduced,
      );
      expect(plan.persistent).toEqual([]);
      expect(plan.isEmpty).toBe(true);
    });
  });
});

describe('messageEffectClassNames', () => {
  it('maps effects to their animation classes', () => {
    const plan = resolveMessageEffectPlan(
      MESSAGE_EFFECT_FLAGS.ZOOM | MESSAGE_EFFECT_FLAGS.GLOW,
      moving,
    );
    expect(messageEffectClassNames(plan)).toEqual(['msg-fx-zoom', 'msg-fx-glow']);
  });

  it('switches persistent effects to their static variant under reduced motion', () => {
    const plan = resolveMessageEffectPlan(MESSAGE_EFFECT_FLAGS.GLOW, { reduceMotion: true });
    expect(messageEffectClassNames(plan)).toEqual(['msg-fx-glow-static']);
  });

  // Le composant sépare les deux familles : les classes d'apparition sont
  // retirées puis reposées à chaque retour dans le viewport pour relancer
  // l'animation CSS, tandis que les persistantes ne doivent jamais clignoter.
  it('can be narrowed to one family at a time', () => {
    const plan = resolveMessageEffectPlan(
      MESSAGE_EFFECT_FLAGS.ZOOM | MESSAGE_EFFECT_FLAGS.GLOW,
      moving,
    );
    expect(messageEffectClassNames({ ...plan, persistent: [] })).toEqual(['msg-fx-zoom']);
    expect(messageEffectClassNames({ ...plan, appearance: [] })).toEqual(['msg-fx-glow']);
  });

  it('returns nothing for an empty plan', () => {
    expect(messageEffectClassNames(resolveMessageEffectPlan(0, moving))).toEqual([]);
  });
});

describe('messageEffectOverlays', () => {
  it('routes particle effects to overlays, not to bubble classes', () => {
    const plan = resolveMessageEffectPlan(
      MESSAGE_EFFECT_FLAGS.CONFETTI | MESSAGE_EFFECT_FLAGS.FIREWORKS | MESSAGE_EFFECT_FLAGS.ZOOM,
      moving,
    );
    expect(messageEffectOverlays(plan)).toEqual(['confetti', 'fireworks']);
  });

  it('returns nothing under reduced motion', () => {
    const plan = resolveMessageEffectPlan(MESSAGE_EFFECT_FLAGS.CONFETTI, { reduceMotion: true });
    expect(messageEffectOverlays(plan)).toEqual([]);
  });
});
