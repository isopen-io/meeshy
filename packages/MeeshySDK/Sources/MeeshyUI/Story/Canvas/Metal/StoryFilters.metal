// StoryFilters.metal — real-time Story canvas filters (compute kernels).
// Bundled into MeeshyUI via SPM `.process("Story/Canvas/Metal")`. Loaded at
// runtime through `device.makeDefaultLibrary(bundle: Bundle.module)`.

#include <metal_stdlib>
using namespace metal;

// Vintage filter: sepia tone + radial vignette.
// `intensity` 0..1 controls the sepia mix (0 = original color, 1 = full sepia).
kernel void vintageFilter(
    texture2d<float, access::read>  input  [[ texture(0) ]],
    texture2d<float, access::write> output [[ texture(1) ]],
    constant float &intensity              [[ buffer(0)  ]],
    uint2 gid                              [[ thread_position_in_grid ]]
) {
    if (gid.x >= input.get_width() || gid.y >= input.get_height()) { return; }
    float4 c = input.read(gid);

    float4 sepia = float4(
        c.r * 0.393 + c.g * 0.769 + c.b * 0.189,
        c.r * 0.349 + c.g * 0.686 + c.b * 0.168,
        c.r * 0.272 + c.g * 0.534 + c.b * 0.131,
        c.a
    );

    float2 center = float2(input.get_width() / 2.0, input.get_height() / 2.0);
    float2 dist   = float2(gid) - center;
    float distSq    = dot(dist, dist);
    float maxDistSq = dot(center, center);
    float vignette  = 1.0 - smoothstep(0.4, 1.0, distSq / maxDistSq);

    float4 result = mix(c, sepia, intensity) * float4(vignette, vignette, vignette, 1.0);
    output.write(result, gid);
}

// BW + contrast filter: Rec.709 luminance to grayscale + centered S-curve.
// `intensity` 0..1 controls the contrast steepness (0 = flat gray, 1 = high contrast).
kernel void bwContrastFilter(
    texture2d<float, access::read>  input  [[ texture(0) ]],
    texture2d<float, access::write> output [[ texture(1) ]],
    constant float &intensity              [[ buffer(0)  ]],
    uint2 gid                              [[ thread_position_in_grid ]]
) {
    if (gid.x >= input.get_width() || gid.y >= input.get_height()) { return; }
    float4 c = input.read(gid);

    float lum = dot(c.rgb, float3(0.2126, 0.7152, 0.0722));

    float curved = (lum - 0.5) * (1.0 + 2.0 * intensity) + 0.5;
    curved = clamp(curved, 0.0, 1.0);

    output.write(float4(curved, curved, curved, c.a), gid);
}
