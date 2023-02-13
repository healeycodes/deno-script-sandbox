# deno-script-sandbox

> My blog post: [Sandboxing JavaScript Code](https://healeycodes.com/sandboxing-javascript-code)

<br>

I wanted to sandbox some JavaScript/TypeScript code and this is the best idea I could come up with given a few hours coding time.

I'm not a security engineer so run this at your absolute peril.

The API allows untrusted execution of a user-supplied code and returns stdout/stderr – but enforces limits on execution time, memory usage, and access to the internet and disk. This is powered by Deno's [Permissions](https://deno.land/manual@v1.26.0/getting_started/permissions) settings.

The API starts a `sandbox.ts` script with locked down permissions that dynamically imports user-supplied code – which means users can send stuff like `console.log(1 + 1)` and then see the result. `fetch` is patched so that it hits the proxy and sends the original URL in the headers.

Scripts can only access URLs from `safeURLs` in `utils.ts`. There are also limits on the number of requests per script run.

There's a concurrency limit on the number of scripts being executed at once but there's no protections against things like DDOS.

Users can run stuff like:

```ts
console.log('hi world!');
```

or

```ts
const res = await fetch("https://hacker-news.firebaseio.com/v0/item/8863.json?print=pretty");
console.log(res.status, await res.text());
```

Errors can be surfaced to users by reading the stderr in the API's response:

```ts
a;
/*
{ "status": { "success": true, "code": 0 },
  "stdout": "",
  "stderr": "ReferenceError: a is not defined\n    at 3ab3252c-0ea7-4058-9cf9-1b0c0b3001c8.ts:1:1\n"
}
*/
```

Users can't run stuff like:

```ts
// This hits a heap limit error due to `--v8-flags=--max-old-space-size` (importantly, the API doesn't crash)
const a = [];
for (let i = 0; i < 9000000000; i++) {
    a.push(i)
}
```

or

```ts
// This hits an access error due to Deno permissions
await Deno.writeTextFile("./hello.txt", "Hello World!");
```

or

```ts
// This won't error but the proxy returns (400, "only these URLs are allowed ...")
const res = await fetch("https://some-non-safe-url.com");
console.log(res.status, await res.text())
```

## Run

`deno run -A api.ts`

Send a test script with `deno run -A local-dev.ts`
