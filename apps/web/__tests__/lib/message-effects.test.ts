import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import {
  resolveMessageEffectPlan,
  messageEffectClassNames,
  messageEffectOverlays,
} from '@/lib/message-effects';

const fresh = { hasPlayedAppearance: false, reduceMotion: false };

describe('resolveMessageEffectPlan', () => {
  it('plays the appearance effect of a message that just arrived', () => {
    const plan = resolveMessageEffectPlan(MESSAGE_EFFECT_FLAGS.CONFETTI, fresh);
    expect(plan.appearance).toEqual(['confetti']);
    expect(plan.isEmpty).toBe(false);
  });

  it('never replays an appearance effect', () => {
    const plan = resolveMessageEffectPlan(MESSAGE_EFFECT_FLAGS.CONFETTI | MESSAGE_EFFECT_FLAGS.SHAKE, {
      ...fresh,
      hasPlayedAppearance: true,
    });
    expect(plan.appearance).toEqual([]);
    expect(plan.isEmpty).toBe(true);
  });

  it('keeps persistent effects across replays — a halo defines the message', () => {
    const plan = resolveMessageEffectPlan(MESSAGE_EFFECT_FLAGS.CONFETTI | MESSAGE_EFFECT_FLAGS.GLOW, {
      ...fresh,
      hasPlayedAppearance: true,
    });
    expect(plan.appearance).toEqual([]);
    expect(plan.persistent).toEqual(['glow']);
    expect(plan.isEmpty).toBe(false);
  });

  it('reports empty for a message without effects so callers skip the wrapper', () => {
    expect(resolveMessageEffectPlan(0, fresh).isEmpty).toBe(true);
    expect(resolveMessageEffectPlan(undefined, fresh).isEmpty).toBe(true);
    expect(resolveMessageEffectPlan(null, fresh).isEmpty).toBe(true);
    expect(resolveMessageEffectPlan(NaN, fresh).isEmpty).toBe(true);
  });

  it('ignores lifecycle-only flags — they are not visual effects', () => {
    const lifecycle =
      MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.BLURRED | MESSAGE_EFFECT_FLAGS.VIEW_ONCE;
    expect(resolveMessageEffectPlan(lifecycle, fresh).isEmpty).toBe(true);
  });

  it('resolves several effects at once', () => {
    const plan = resolveMessageEffectPlan(
      MESSAGE_EFFECT_FLAGS.ZOOM | MESSAGE_EFFECT_FLAGS.GLOW | MESSAGE_EFFECT_FLAGS.SPARKLE,
      fresh,
    );
    expect(plan.appearance).toEqual(['zoom']);
    expect(plan.persistent).toEqual(['glow', 'sparkle']);
  });

  describe('reduced motion', () => {
    const reduced = { hasPlayedAppearance: false, reduceMotion: true };

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
      fresh,
    );
    expect(messageEffectClassNames(plan)).toEqual(['msg-fx-zoom', 'msg-fx-glow']);
  });

  it('switches persistent effects to their static variant under reduced motion', () => {
    const plan = resolveMessageEffectPlan(MESSAGE_EFFECT_FLAGS.GLOW, {
      hasPlayedAppearance: false,
      reduceMotion: true,
    });
    expect(messageEffectClassNames(plan)).toEqual(['msg-fx-glow-static']);
  });

  it('returns nothing for an empty plan', () => {
    expect(messageEffectClassNames(resolveMessageEffectPlan(0, fresh))).toEqual([]);
  });
});

describe('messageEffectOverlays', () => {
  it('routes particle effects to overlays, not to bubble classes', () => {
    const plan = resolveMessageEffectPlan(
      MESSAGE_EFFECT_FLAGS.CONFETTI | MESSAGE_EFFECT_FLAGS.FIREWORKS | MESSAGE_EFFECT_FLAGS.ZOOM,
      fresh,
    );
    expect(messageEffectOverlays(plan)).toEqual(['confetti', 'fireworks']);
  });

  it('returns nothing once the appearance has played', () => {
    const plan = resolveMessageEffectPlan(MESSAGE_EFFECT_FLAGS.CONFETTI, {
      ...fresh,
      hasPlayedAppearance: true,
    });
    expect(messageEffectOverlays(plan)).toEqual([]);
  });
});
