import { get_encoding, type Tiktoken } from "tiktoken";

let encoder: Tiktoken | null = null;
let initFailed = false;

function getEncoder(): Tiktoken | null {
  if (encoder !== null) {
    return encoder;
  }
  if (initFailed) {
    return null;
  }
  try {
    encoder = get_encoding("cl100k_base");
    return encoder;
  } catch {
    initFailed = true;
    return null;
  }
}

export function tokenLen(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const enc = getEncoder();
  if (enc === null) {
    return Math.ceil(text.length / 4);
  }
  try {
    return enc.encode(text, "all").length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

export function encodeTokens(text: string): number[] {
  const enc = getEncoder();
  if (enc === null) {
    return [];
  }
  try {
    return Array.from(enc.encode(text, "all"));
  } catch {
    return [];
  }
}

export function decodeTokens(tokens: number[]): string {
  const enc = getEncoder();
  if (enc === null) {
    return "";
  }
  try {
    const bytes = enc.decode(new Uint32Array(tokens));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}
