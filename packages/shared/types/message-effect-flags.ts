// Message Effect Flags — Bit assignments (source of truth)
// These MUST match MessageEffectFlags in packages/MeeshySDK/Sources/MeeshySDK/Models/MessageEffects.swift

export const MESSAGE_EFFECT_FLAGS = {
    // Lifecycle (bits 0-7)
    EPHEMERAL: 1 << 0,   // 1
    BLURRED:   1 << 1,   // 2
    VIEW_ONCE: 1 << 2,   // 4
    // Appearance one-shot (bits 8-15)
    SHAKE:     1 << 8,   // 256
    ZOOM:      1 << 9,   // 512
    EXPLODE:   1 << 10,  // 1024
    CONFETTI:  1 << 11,  // 2048
    FIREWORKS: 1 << 12,  // 4096
    WAOO:      1 << 13,  // 8192
    // Persistent (bits 16-23)
    GLOW:      1 << 16,  // 65536
    PULSE:     1 << 17,  // 131072
    RAINBOW:   1 << 18,  // 262144
    SPARKLE:   1 << 19,  // 524288
} as const;

export type MessageEffectFlagKey = keyof typeof MESSAGE_EFFECT_FLAGS;

export function hasEffect(flags: number, effect: number): boolean {
    return (flags & effect) !== 0;
}

export function mergeEffects(flags: number, ...effects: number[]): number {
    return effects.reduce((acc, e) => acc | e, flags);
}
