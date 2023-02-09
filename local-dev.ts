// Use this to mimic a new script request

fetch("http://localhost:3001/script", {
  method: "POST",
  body: `
console.log("hi!");
`,
})
  .then((res) => res.text())
  .then((text) => console.log(text));
