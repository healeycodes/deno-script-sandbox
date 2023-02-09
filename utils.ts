import * as path from "https://deno.land/std@0.176.0/path/mod.ts";

// Create a script on disk
export async function createScript(code: string) {
  const scriptId = crypto.randomUUID();
  const scriptPath = `./scripts/${scriptId}.ts`;
  await Deno.writeTextFile(scriptPath, code);
  return { scriptId, scriptPath: path.resolve(scriptPath) };
}

export const safeURLs = [
  "https://healeycodes.com/",
  "https://hacker-news.firebaseio.com/",
  "https://api.github.com/",
];

// Check if an URL is known and safe
export function safeURL(url: string) {
  for (let i = 0; i < safeURLs.length; i++) {
    if (url.slice(0, safeURLs[i].length) === safeURLs[i]) {
      return true;
    }
  }

  return false;
}
