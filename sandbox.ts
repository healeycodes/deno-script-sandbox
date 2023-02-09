const scriptId = Deno.args[0] /* `scriptId=b` */.split("=")[1];
const scriptPath = Deno.args[1] /* `scriptPath=/a/b.ts` */.split("=")[1];
const scriptProxy = "http://localhost:3001/proxy";
const scriptAuthHeaders = {
  "x-script-id": scriptId,
};

const realFetch = fetch;

// User fetch (all requests pass through, and are limited by, the proxy)
// n.b. there's no way around this – all other hosts are locked down via `--allow-net`
// e.g. `realFetch("https://bing.com")` will cause the sandbox to crash with `PermissionDenied`
globalThis.fetch = (
  input: string | Request | URL,
  init?: RequestInit | undefined,
) => {
  if (init === undefined) {
    init = {};
  }

  init.headers = {
    ...init.headers,
    ...scriptAuthHeaders,
    "x-script-fetch": input.toString(),
  };
  return realFetch(scriptProxy, init);
};

try {
  await import(scriptPath);
} catch (e) {
  console.error(e);
}
