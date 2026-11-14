package me.meeshy.ui.component.bubble

/**
 * La combustion d'un éphémère en AGSL (#18556) — portage de `meeshyEphemeralBurn`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Resources/Shaders/EphemeralBurnShaders.metal`, #17938), mêmes uniforms, mêmes
 * temps : le front de bruit à l'échelle d'une lettre, le charbon puis la braise, les flammes couchées par le vent, vingt
 * étincelles, les cendres. Le shader est PUR : le temps, le sens du front (figé à l'allumage), la dérive et la graine
 * viennent de l'hôte. Il calcule en points (`density`) pour garder les échelles d'iOS.
 */
internal object EphemeralBurnShaderSources {

    const val LAYER = "layer"

    val BURN: String = """
        uniform shader layer;
        uniform float2 size;
        uniform float progress;
        uniform float frontDirection;
        uniform float drift;
        uniform float seed;
        uniform float2 overhang;
        uniform float density;

        float burnHash21(float2 point) {
            float2 q = fract(point * float2(123.34, 456.21));
            q += dot(q, q + 45.32);
            return fract(q.x * q.y);
        }

        float burnHash11(float n) {
            return fract(sin(n * 127.1) * 43758.5453);
        }

        float burnValueNoise(float2 p) {
            float2 i = floor(p);
            float2 f = fract(p);
            float2 u = f * f * (3.0 - 2.0 * f);
            float a = burnHash21(i);
            float b = burnHash21(i + float2(1.0, 0.0));
            float c = burnHash21(i + float2(0.0, 1.0));
            float d = burnHash21(i + float2(1.0, 1.0));
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float burnFbm(float2 p) {
            float v = 0.5 * burnValueNoise(p);
            v += 0.25 * burnValueNoise(p * 2.03 + 17.1);
            v += 0.125 * burnValueNoise(p * 4.11 + 31.7);
            return v / 0.875;
        }

        float burnFront(float t) {
            return mix(-0.55, 1.55, clamp((t - 0.04) / 0.86, 0.0, 1.0));
        }

        float burnValue(float2 position, float2 contentOrigin, float2 contentSize, float front) {
            float2 c = (position - contentOrigin) / contentSize;
            float a = frontDirection > 0.0 ? c.x : 1.0 - c.x;
            float n = burnFbm(position / 14.0 + seed * 37.0);
            return front - a - (n - 0.5) * 0.8;
        }

        half4 sampleAt(float2 position) {
            return layer.eval(position * density);
        }

        half burnMatter(float2 position) {
            half a = sampleAt(position).a;
            a = max(a, sampleAt(position + float2(5.0, 0.0)).a);
            a = max(a, sampleAt(position - float2(5.0, 0.0)).a);
            a = max(a, sampleAt(position + float2(0.0, 5.0)).a);
            a = max(a, sampleAt(position - float2(0.0, 5.0)).a);
            return a;
        }

        float flameAt(float2 position, float step, float2 contentOrigin, float2 contentSize, float front) {
            float2 below = position + float2(-drift * step * 0.6, step);
            float bb = burnValue(below, contentOrigin, contentSize, front);
            if (bb > -0.16 && bb < 0.06 && burnMatter(below) > 0.05) {
                float lick = burnFbm(position / 10.0 + float2(-drift * 4.0, progress * 18.0 + seed * 11.0));
                return smoothstep(0.35, 0.75, lick) * (1.0 - step / 44.0);
            }
            return 0.0;
        }

        half4 main(float2 fragCoord) {
            float2 position = fragCoord / density;
            if (progress <= 0.0) { return sampleAt(position); }
            if (progress >= 1.0) { return half4(0.0); }

            float2 points = size / density;
            float2 contentOrigin = float2(overhang.x, overhang.y);
            float2 contentSize = max(points - float2(2.0 * overhang.x, overhang.y), float2(1.0));
            float front = burnFront(progress);
            float ash = clamp((progress - 0.8) / 0.2, 0.0, 1.0);

            float b = burnValue(position, contentOrigin, contentSize, front);
            float heat = exp(-b * b / 0.01);
            float2 warped = position - float2(drift, -1.0) * 6.0 * heat - float2(drift * 12.0 * ash, 0.0);
            half4 src = sampleAt(warped);

            half4 color = src;
            if (b > 0.08) {
                color = half4(0.0);
            } else if (b > 0.0) {
                float k = b / 0.08;
                half thinning = half(1.0 - k * 0.7);
                color = half4(half3(0.10, 0.05, 0.02) * src.a, src.a) * thinning;
            } else if (b > -0.16) {
                float k = (b + 0.16) / 0.16;
                half matter = burnMatter(position);
                half glowHeat = half(smoothstep(0.4, 1.0, k));
                half3 ember = mix(half3(1.0, 0.25, 0.03), half3(1.0, 0.78, 0.22), glowHeat * glowHeat);
                half glow = glowHeat * matter * 0.95;
                color = half4(src.rgb * (1.0 - glow) + ember * glow, max(src.a, glow));
            }

            float flame = flameAt(position, 8.0, contentOrigin, contentSize, front);
            flame = max(flame, flameAt(position, 16.0, contentOrigin, contentSize, front));
            flame = max(flame, flameAt(position, 28.0, contentOrigin, contentSize, front));
            if (flame > 0.0) {
                float f = min(flame * 1.2, 1.0) * (1.0 - ash);
                half3 flameColor = mix(half3(1.0, 0.28, 0.04), half3(1.0, 0.82, 0.30), half(f));
                color = half4(color.rgb * (1.0 - half(f)) + flameColor * half(f), max(color.a, half(f)));
            }

            for (int i = 0; i < 20; i++) {
                float fi = float(i);
                float h1 = burnHash11(seed * 91.7 + fi * 13.1);
                float h2 = burnHash11(seed * 53.3 + fi * 7.9);
                float h3 = burnHash11(seed * 29.1 + fi * 3.3);
                float t0 = mix(0.1, 0.75, h1);
                float age = (progress - t0) / 0.35;
                if (age > 0.0 && age < 1.0) {
                    float ax = clamp(burnFront(t0), 0.0, 1.0);
                    float ox = frontDirection > 0.0 ? ax : 1.0 - ax;
                    float2 origin = contentOrigin + float2(ox, h2) * contentSize;
                    float life = age * 0.35 * 1.2;
                    float2 velocity = float2(drift * 60.0 + (h3 - 0.5) * 40.0, -90.0 - h2 * 30.0);
                    float2 p = origin + velocity * life + float2(0.0, 40.0) * life * life;
                    float2 d = position - p;
                    float glow = exp(-dot(d, d) / 9.0) * (1.0 - age);
                    half3 sparkColor = mix(half3(1.0, 0.9, 0.4), half3(1.0, 0.3, 0.05), half(age));
                    color += half4(sparkColor * half(glow), half(glow));
                }
            }

            if (ash > 0.0) {
                half luma = dot(color.rgb, half3(0.299, 0.587, 0.114));
                half3 gray = half3(luma) * 0.8;
                color.rgb = mix(color.rgb, gray, half(ash));
                color *= half(1.0 - ash);
            }

            color = clamp(color, half4(0.0), half4(1.0));
            color.rgb = min(color.rgb, half3(color.a));
            return color;
        }
    """.trimIndent()
}
