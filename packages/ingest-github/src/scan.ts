import { opendir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const MAX_FILE_BYTES = 1_048_576;

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "coverage",
  ".bytebell",
]);

const SKIP_FILES = new Set([
  ".DS_Store",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "Cargo.lock",
  "Pipfile.lock",
  "poetry.lock",
]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".bmp",
  ".tiff",
  ".svg",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".webm",
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
  ".eot",
  ".class",
  ".jar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".wasm",
  ".bin",
]);

export interface ScannedFile {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  content: string;
}

export async function countFiles(rootDir: string): Promise<number> {
  let count = 0;
  async function scan(currentDir: string) {
    const dir = await opendir(currentDir);
    for await (const entry of dir) {
      const abs = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }
        await scan(abs);
      } else if (entry.isFile()) {
        if (SKIP_FILES.has(entry.name)) {
          continue;
        }
        if (BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
          continue;
        }
        // Skip size check for counting or keep it? Keep it for consistency.
        const sizeBytes = (await stat(abs)).size;
        if (sizeBytes <= MAX_FILE_BYTES) {
          count++;
        }
      }
    }
  }
  await scan(rootDir);
  return count;
}

export async function* walkRepo(rootDir: string): AsyncGenerator<ScannedFile> {
  yield* walk(rootDir, rootDir);
}

async function* walk(rootDir: string, currentDir: string): AsyncGenerator<ScannedFile> {
  const dir = await opendir(currentDir);
  for await (const entry of dir) {
    const abs = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      yield* walk(rootDir, abs);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (SKIP_FILES.has(entry.name)) {
      continue;
    }
    if (BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }
    const sizeBytes = (await stat(abs)).size;
    if (sizeBytes > MAX_FILE_BYTES) {
      continue;
    }
    const buf = await readFile(abs);
    if (looksBinary(buf)) {
      continue;
    }
    const content = buf.toString("utf8");
    yield {
      relativePath: path.relative(rootDir, abs),
      absolutePath: abs,
      sizeBytes,
      content,
    };
  }
}

function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }
  }
  return false;
}
