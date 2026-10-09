import http from "node:http";

export async function startFixture() {
  const observations = { requests: [], destructiveRequests: 0, writes: 0 };
  const server = http.createServer((request, response) => {
    observations.requests.push({ method: request.method, url: request.url });
    if (request.url === "/delete") {
      observations.destructiveRequests++;
      response.end("deleted");
      return;
    }
    if (request.url === "/write") {
      observations.writes++;
      response.end("changed");
      return;
    }
    if (request.url === "/redirect-private") {
      response.writeHead(302, {
        location: "http://169.254.169.254/latest/meta-data/",
      });
      response.end();
      return;
    }
    response.setHeader("Content-Type", "text/html");
    response.end(
      `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test booking product</title></head><body><main><h1>Book an appointment</h1><p id="isolation"></p><button id="start" onclick="document.querySelector('#booking').hidden=false">Start booking</button><form id="booking" hidden><label>Your test name<input id="test-name" name="testName"></label><button id="confirm" type="submit">Confirm test booking</button></form><p id="saved" hidden>Test booking saved</p><button id="unsafe" onclick="fetch('/delete')">Delete account</button><button id="write" onclick="fetch('/write',{method:'POST'})">Save staging record</button><a id="private" href="/redirect-private">Open linked resource</a><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" alt=""><script>const count=Number(localStorage.getItem('visits')||0)+1;localStorage.setItem('visits',count);document.querySelector('#isolation').textContent='Session visits: '+count;document.querySelector('#booking').onsubmit=e=>{e.preventDefault();if(document.querySelector('#test-name').value.length>1)document.querySelector('#saved').hidden=false;};</script></main></body></html>`,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    observations,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
export function fixtureSpec(origin, patch = {}) {
  return {
    mode: "functional",
    targetUrl: origin,
    allowedOrigins: [origin],
    authorizationConfirmed: true,
    productVersion: "fixture-v1",
    objective: "Can new users make a test appointment?",
    approvedAt: new Date().toISOString(),
    personas: Array.from({ length: 10 }, (_, i) => ({
      id: `profile-${i}`,
      name: `Profile ${i + 1}`,
      goal: "Save a test appointment",
      device: i % 2 ? "mobile" : "desktop",
      experience: i % 3 ? "familiar" : "first-time",
      technicalProficiency: i % 3 ? "high" : "low",
      motivation: "Complete a booking",
      privacySensitivity: i % 2 ? "high" : "low",
      timeBudgetSeconds: 120,
      exploration: i % 2 ? "low" : "high",
      seed: i + 1,
    })),
    tasks: [
      {
        id: "booking",
        title: "Book a test appointment",
        instructions: "Open booking and save a fictional appointment.",
        question: "Did the booking save?",
        successCriteria:
          "A saved test booking is visible and the browser is isolated.",
        steps: [
          {
            id: "open",
            type: "click",
            selector: "#start",
            description: "Open the booking form",
          },
          {
            id: "name",
            type: "fill",
            selector: "#test-name",
            value: "Synthetic Participant",
            description: "Enter a fictional participant name",
          },
          {
            id: "save",
            type: "click",
            selector: "#confirm",
            description: "Confirm the staging test booking",
          },
        ],
        assertions: [
          {
            id: "saved",
            type: "text-visible",
            value: "Test booking saved",
            description: "Saved confirmation is visible",
          },
          {
            id: "isolated",
            type: "text-visible",
            value: "Session visits: 1",
            description: "Independent browser storage",
          },
        ],
      },
    ],
    settings: {
      runCount: 10,
      concurrency: 2,
      maxSteps: 15,
      maxDurationSeconds: 120,
      maxModelTokens: 0,
      maxCostUsd: 0,
      model: "gpt-6-luna",
      seed: 1,
    },
    ...patch,
  };
}
