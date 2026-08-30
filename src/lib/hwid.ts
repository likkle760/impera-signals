/**
 * Client-side "HWID" device fingerprint.
 *
 * Real browser hardware IDs are not reliably accessible, so we build a robust
 * device fingerprint from WebGL/Canvas rendering, platform, and a persistent
 * random device secret stored in localStorage. The server binds every license
 * to the first fingerprint that activates it, so the same key can't be used
 * on another device.
 */

const DEVICE_ID_KEY = "impera_device_id";

function hash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16) + (4294967296 * (2097151 & h1) + (h2 >>> 0)).toString(16);
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("ImperaSignals-1234567890", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("abcdefghijklmnopqrstuvwxyz0123456789", 4, 40);
    return canvas.toDataURL();
  } catch {
    return "no-canvas";
  }
}

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return "no-webgl";
    const renderer = gl.getParameter(gl.RENDERER) as string;
    const vendor = gl.getParameter(gl.VENDOR) as string;
    return `${vendor}~${renderer}`;
  } catch {
    return "no-webgl";
  }
}

function getDeviceSecret(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id =
        Math.random().toString(36).slice(2) +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

/**
 * Compute the device fingerprint. Best-effort, deterministic per browser/device.
 */
export function computeDeviceFingerprint(): string {
  const parts = [
    navigator.userAgent,
    navigator.language ?? "",
    navigator.platform ?? "",
    navigator.hardwareConcurrency ?? "",
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    new Date().getTimezoneOffset(),
    getCanvasFingerprint(),
    getWebGLFingerprint(),
    getDeviceSecret()
  ];
  return `hwid-${hash(parts.join("||")).slice(0, 32)}`;
}
