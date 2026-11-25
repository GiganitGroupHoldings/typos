export const nebulaField = `
  float map(vec3 p, float t, float seed, vec4 rotation, float drift) {
    p.xz *= mat2(rotation.x, -rotation.y, rotation.y, rotation.x);
    p.xy *= mat2(rotation.z, -rotation.w, rotation.w, rotation.z);
    vec3 q = p * 2. + t + seed;

    return length(p + vec3(drift)) * log(length(p) + 1.0)
         + sin(q.x + sin(q.z + sin(q.y))) * 0.5 - 1.0;
  }

  float nebula(vec2 uv, float t, float seed, vec4 rotation, float drift) {
    float col = 0.0;
    float d = 2.5;
    vec3 ray = normalize(vec3(uv, -1.));
    for (int i = 0; i <= 5; i++) {
      vec3 p = vec3(0, 0, 5.) + ray * d;
      float rz = map(p, t, seed, rotation, drift);
      float f = clamp((rz - map(p + 0.1, t, seed, rotation, drift)) * 0.5, -0.1, 1.0);
      float base = 0.35 + 5.0 * f;
      col = col * base + smoothstep(2.5, 0.0, rz) * 0.7 * base;
      d += min(rz, 1.0);
    }
    return 1.0 - exp(-max(col, 0.0) * 0.9);
  }
`
