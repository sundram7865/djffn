// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const ROOT = join(SRC, "..");
const EM_DASH = String.fromCharCode(0x2014);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("user-facing copy", () => {
  it("never uses an em dash", () => {
    const offenders = [...files(SRC), join(ROOT, "index.html")]
      .filter((f) => /\.(tsx?|css|html)$/.test(f))
      .filter((f) => readFileSync(f, "utf-8").includes(EM_DASH));
    expect(offenders).toEqual([]);
  });
});
