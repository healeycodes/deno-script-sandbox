import { Semaphore } from "https://deno.land/x/semaphore@v1.1.2/semaphore.ts";
import { serve } from "https://deno.land/std@0.176.0/http/mod.ts";
import { createScript, safeURL, safeURLs } from "./utils.ts";

// Sandboxed scripts are only allowed to reach the internet via
// this proxy (enforced via --allow-net).
const PROXY_LOCATION = "localhost:3001";

const SCRIPT_TIME_LIMIT = 1000; // ms
const SCRIPT_MEMORY_LIMIT = 64; // mb
const SCRIPT_REQUEST_LIMIT = 5; // number of requests per script

const CONCURRENCY_LIMIT = 3;
const concurrencyMutex = new Semaphore(CONCURRENCY_LIMIT);

// Track scripts that are running so that we can:
// - auth requests to the proxy
// - limit the number of requests per script
const inFlightScriptIds: Record<string, number> = {};

const SCRIPT_ROUTE = new URLPattern({ pathname: "/script" });
const PROXY_ROUTE = new URLPattern({ pathname: "/proxy" });

async function handler(req: Request) {
  if (SCRIPT_ROUTE.exec(req.url)) {
    // TODO: stop users sending gigabytes of source code
    const code = await req.text();
    const { scriptId, scriptPath } = await createScript(code);
    inFlightScriptIds[scriptId] = SCRIPT_REQUEST_LIMIT;

    const cmd = [
      "deno",
      "run",
      `--v8-flags=--max-old-space-size=${SCRIPT_MEMORY_LIMIT}`,
      `--allow-read=${scriptPath}`,
      `--allow-net=${PROXY_LOCATION}`,
      "./sandbox.ts",
      `scriptId=${scriptId}`,
      `scriptPath=${scriptPath}`,
    ];

    const release = await concurrencyMutex.acquire();
    const scriptProcess = Deno.run({ cmd, stderr: "piped", stdout: "piped" });
    release();

    setTimeout(async () => {
      try {
        scriptProcess.kill();
        scriptProcess.close();
      } catch (e) {
        if (!e.message.includes("ESRCH")) { // Might have already closed
          console.log(`couldn't kill or close ${scriptId}`, { error: e, code });
        }
      }

      try {
        await Deno.remove(scriptPath);
      } catch (e) {
        console.log(`couldn't remove ${scriptPath}`, { error: e, code });
      }
    }, SCRIPT_TIME_LIMIT);

    const [status, stdout, stderr] = await Promise.all([
      scriptProcess.status(),
      scriptProcess.output(),
      scriptProcess.stderrOutput(),
    ]);
    try {
      scriptProcess.kill();
      scriptProcess.close();
    } catch (e) {
      if (!e.message.includes("ESRCH")) { // Might have already closed
        console.log(`couldn't kill or close ${scriptId}`, { error: e, code });
      }
    }
    delete inFlightScriptIds[scriptId];

    return new Response(
      JSON.stringify({
        status,
        stdout: new TextDecoder().decode(stdout),
        stderr: new TextDecoder().decode(stderr),
      }),
      {
        status: 200,
      },
    );
  }

  // Proxy
  if (PROXY_ROUTE.exec(req.url)) {
    const resource = req.headers.get("x-script-fetch") ||
      "missing-resource";
    const scriptId = req.headers.get("x-script-id");

    // Check the request came from a real script
    if (scriptId === null || !inFlightScriptIds[scriptId]) {
      return new Response(
        `bad auth: ${safeURLs.join("\n")}`,
        { status: 400 },
      );
    }

    // Apply some limits
    if (--inFlightScriptIds[scriptId] < 1) {
      return new Response(
        `too many requests, max requests per script: ${SCRIPT_REQUEST_LIMIT}`,
        { status: 400 },
      );
    }
    if (!safeURL(resource)) {
      return new Response(
        `only these URLs are allowed: [${safeURLs.join(", ")}]`,
        { status: 400 },
      );
    }

    try {
      const controller = new AbortController();
      const { signal } = controller;
      setTimeout(() => {
        try {
          controller.abort();
        } catch { /* */ } // The fetch might have already ended
      }, SCRIPT_TIME_LIMIT);
      const proxiedRes = await fetch(resource, {
        method: req.method,
        headers: {
          ...req.headers,
        },
        body: req.body,
        signal,
      });

      return new Response(proxiedRes.body, {
        ...proxiedRes,
      });
    } catch (e) {
      console.log(`error while proxying ${resource}`, { error: e });
      return new Response("", { status: 500 });
    }
  }

  return new Response("hm, unknown route", { status: 404 });
}

serve(handler, { port: 3001 });
