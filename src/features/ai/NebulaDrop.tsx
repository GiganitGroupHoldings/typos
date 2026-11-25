import { useEffect, useRef } from "react"
import { Camera, Mesh, PlaneGeometry, Scene, ShaderMaterial, WebGLRenderer } from "three"
import { nebulaField } from "@/components/ui/nebulaField"

const vertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.);
  }
`

const fragment = `
  varying vec2 vUv;
  uniform float uTime;
  ${nebulaField}

  vec3 prism(float hue) {
    return 0.55 + 0.45 * cos(6.28318 * (hue + vec3(0., 0.66, 0.33)));
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.35;
    float tip = smoothstep(-0.35, 0.88, p.y);
    vec2 q = vec2((p.x + 0.25 * tip * tip) * mix(1.02, 2.35, tip), (p.y + 0.09) * 0.91);
    float r = length(q);
    float alpha = 1. - smoothstep(0.972, 1.005, r);
    if (alpha <= 0.) discard;

    float z = sqrt(max(0., 1. - r * r));
    vec3 n = vec3(q, z);
    float t = uTime * 0.98;
    vec4 rotation = vec4(cos(t * 0.57), sin(t * 0.57), cos(t * 0.37), sin(t * 0.37));
    vec2 drift = vec2(sin(t * 0.63), cos(t * 0.49)) * 0.17;
    float cloud = nebula(q * 0.43 + vec2(z * 0.15, -z * 0.19) + drift, t, 1.8, rotation, 0.09);
    float hue = 0.60 + 0.24 * p.x + 0.3 * p.y + cloud * 0.31 + t * 0.13;
    float fresnel = pow(1. - z, 2.);
    float light = max(dot(n, normalize(vec3(-0.6, 0.72, 1.))), 0.);
    float spec = pow(max(dot(n, normalize(vec3(-0.41, 0.48, 1.))), 0.), 37.);
    float bounce = pow(max(dot(n, normalize(vec3(0.55, -0.68, 0.4))), 0.), 14.);
    vec3 color = mix(vec3(0.055, 0.09, 0.17), prism(hue) * 0.83, 0.18 + cloud * 0.68);
    color *= 0.62 + light * 0.53;
    color += prism(hue - 0.19) * fresnel * 0.8;
    color += vec3(0.86, 0.97, 1.) * (spec * 0.86 + bounce * 0.34);
    color += vec3(0.2, 0.25, 0.30) * smoothstep(0.94, 0.985, r);
    gl_FragColor = vec4(clamp(color, 0., 1.), alpha);
  }
`

/** Маленькое полотно использует поле туманности и рисует преломление по форме капли. */
export function NebulaDrop() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !("WebGL2RenderingContext" in window)) return
    const context = canvas.getContext("webgl2", { alpha: true, antialias: false, powerPreference: "low-power" })
    if (!context) return
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ canvas, context, alpha: true, premultipliedAlpha: false })
    } catch {
      return
    }
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const geometry = new PlaneGeometry(2, 2)
    const uniforms = { uTime: { value: 0 } }
    const material = new ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, depthTest: false, depthWrite: false })
    const scene = new Scene()
    const camera = new Camera()
    scene.add(new Mesh(geometry, material))
    renderer.setClearColor(0, 0)
    renderer.setSize(144, 144, false)
    let frame = 0
    let last = 0
    let invalid = false
    renderer.debug.onShaderError = () => {
      invalid = true
    }
    const paint = () => renderer.render(scene, camera)
    const tick = (now: number) => {
      if (now - last >= 40) {
        uniforms.uTime.value += Math.min(now - last, 50) / 1000
        last = now
        paint()
      }
      frame = requestAnimationFrame(tick)
    }
    const sync = () => {
      cancelAnimationFrame(frame)
      if (invalid || context.isContextLost()) return
      paint()
      if (!invalid) canvas.dataset.ready = ""
      if (!invalid && !motion.matches && !document.hidden) {
        last = performance.now()
        frame = requestAnimationFrame(tick)
      }
    }
    const lost = () => {
      cancelAnimationFrame(frame)
      delete canvas.dataset.ready
    }
    sync()
    motion.addEventListener("change", sync)
    document.addEventListener("visibilitychange", sync)
    canvas.addEventListener("webglcontextlost", lost)
    canvas.addEventListener("webglcontextrestored", sync)
    return () => {
      lost()
      motion.removeEventListener("change", sync)
      document.removeEventListener("visibilitychange", sync)
      canvas.removeEventListener("webglcontextlost", lost)
      canvas.removeEventListener("webglcontextrestored", sync)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <span aria-hidden className="assistant-drop-art">
      <canvas ref={ref} />
    </span>
  )
}
