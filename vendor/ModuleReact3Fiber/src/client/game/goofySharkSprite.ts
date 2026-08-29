import { SKINS } from "../../engine/index.js";
import type { NetSnake } from "../../protocol/index.js";

const skins = new Map(SKINS.map((skin) => [skin.id, skin]));
const cache = new Map<string, HTMLImageElement>();

/** Actual inline SVG art, cached as browser images so the canvas can draw it cheaply. */
export function goofySharkSprite(shark: NetSnake): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  const skin = skins.get(shark.skin) ?? SKINS[0];
  let image = cache.get(skin.id);
  if (image) return image;
  image = new Image();
  image.decoding = "async";
  image.alt = "";
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(goofySharkSvg(skin.color, skin.accent ?? "#0b7189"))}`;
  cache.set(skin.id, image);
  return image;
}

function goofySharkSvg(body: string, accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 110">
    <path d="M35 55 4 26l8 30-8 29 31-25c12 26 67 35 112 4 12-8 20-8 29-9-9-2-17-4-29-12C102 13 47 27 35 55Z" fill="${body}" stroke="#070b14" stroke-width="5" stroke-linejoin="round"/>
    <path d="M76 29 91 5l19 28M76 75 90 102l14-29" fill="${accent}" stroke="#070b14" stroke-width="5" stroke-linejoin="round"/>
    <path d="M41 48c24-15 62-22 106-5-43-8-79 1-105 19Z" fill="#fff" opacity=".18"/>
    <circle cx="137" cy="40" r="13" fill="#fff" stroke="#070b14" stroke-width="4"/>
    <circle cx="142" cy="43" r="5" fill="#070b14"/>
    <path d="M119 66q21 16 42-2-21 31-42 2Z" fill="#47142a" stroke="#070b14" stroke-width="4" stroke-linejoin="round"/>
    <path d="m126 69 5 10 6-8 6 8 5-11" fill="#fff" stroke="#070b14" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="158" cy="48" r="3" fill="#070b14"/>
  </svg>`;
}
