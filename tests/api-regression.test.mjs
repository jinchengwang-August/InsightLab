import assert from "node:assert/strict";
import test from "node:test";
import { hasVerifiedSupabaseSession } from "../app/auth-flow.ts";
import { discoveryModeForResponse } from "../app/discovery-flow.ts";
import { analyzeForUser } from "../app/api/analyze/core.ts";
import { getPublishedValidations } from "../app/api/validations/discovery.ts";
import { verifyExternalUser } from "../app/external-auth.ts";

const identities = {
  owner: { id: "owner-id", email: "owner@example.test", user_metadata: { name: "Owner" } },
  intruder: { id: "intruder-id", email: "intruder@example.test", user_metadata: { name: "Intruder" } },
  contributor: { id: "contributor-id", email: "contributor@example.test", user_metadata: { name: "Contributor" } },
};

const authFetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === "https://auth.example.test/auth/v1/user") {
    const authorization = new Headers(init?.headers).get("authorization") ?? "";
    const identity = identities[authorization.replace(/^Bearer /, "")];
    return identity
      ? Response.json(identity)
      : Response.json({ error: "invalid token" }, { status: 401 });
  }
  return Response.json({ error: "unexpected URL" }, { status: 404 });
};

class MockD1 {
  constructor({ validation = null, responses = [], validations = [] } = {}) {
    this.validation = validation;
    this.responses = responses;
    this.validations = validations;
    this.calls = [];
  }

  prepare(sql) {
    const { calls, validation, responses, validations } = this;
    const statement = {
      bindings: [],
      bind(...values) {
        this.bindings = values;
        return this;
      },
      async first() {
        calls.push({ method: "first", sql, bindings: this.bindings });
        if (/SELECT id,creator_email FROM validations/i.test(sql)) return validation;
        return null;
      },
      async all() {
        calls.push({ method: "all", sql, bindings: this.bindings });
        if (/PRAGMA table_info\(validations\)/i.test(sql)) {
          return { results: [{ name: "repository_url" }] };
        }
        if (/FROM responses r LEFT JOIN profiles/i.test(sql)) {
          return { results: responses };
        }
        if (/FROM validations v/i.test(sql)) {
          return { results: validations };
        }
        return { results: [] };
      },
      async run() {
        calls.push({ method: "run", sql, bindings: this.bindings });
        return { success: true, meta: {} };
      },
    };
    return statement;
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

const authEnvironment = {
  SUPABASE_URL: "https://auth.example.test",
  SUPABASE_PUBLISHABLE_KEY: "public-test-key",
};
const apiRequest = (path, token, extraHeaders = {}) => new Request(`http://localhost${path}`, {
  headers: {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  },
});

test("analyze rejects unauthenticated requests", async () => {
  const response = await analyzeForUser(apiRequest("/api/analyze"), null, new MockD1());
  assert.equal(response.status, 401);
});

test("analyze rejects a verified user who does not own the requested idea", async () => {
  const db = new MockD1({ validation: { id: 7, creator_email: identities.owner.email } });
  const request = apiRequest("/api/analyze?validationId=7&email=owner@example.test", "intruder");
  const user = await verifyExternalUser(request, authEnvironment, authFetch);
  const response = await analyzeForUser(request, user, db);
  assert.equal(response.status, 403);
  assert.deepEqual(db.calls.find((call) => call.method === "first")?.bindings, [7]);
});

test("analyze returns 404 for an unknown idea", async () => {
  const request = apiRequest("/api/analyze?validationId=999", "owner");
  const user = await verifyExternalUser(request, authEnvironment, authFetch);
  const response = await analyzeForUser(request, user, new MockD1());
  assert.equal(response.status, 404);
});

test("analyze rejects records with no creator identity", async () => {
  const request = apiRequest("/api/analyze?validationId=8", "owner");
  const user = await verifyExternalUser(request, authEnvironment, authFetch);
  const response = await analyzeForUser(request, user, new MockD1({ validation: { id: 8, creator_email: null } }));
  assert.equal(response.status, 403);
});

test("analyze allows the token-verified owner to read analysis", async () => {
  const db = new MockD1({
    validation: { id: 9, creator_email: identities.owner.email },
    responses: [{ body: "Convenient pickup", sentiment: 0.8, integrity_score: 90, model_weight: 1, category: "use", contributor_name: "Member" }],
  });
  const request = apiRequest("/api/analyze?validationId=9", "owner");
  const user = await verifyExternalUser(request, authEnvironment, authFetch);
  const response = await analyzeForUser(request, user, db);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.responseCount, 1);
  assert.equal(db.calls.find((call) => /FROM responses/i.test(call.sql))?.bindings[0], 9);
});

test("analyze latest selection is owner-scoped and deterministically ordered", async () => {
  const db = new MockD1({ validation: { id: 12, creator_email: identities.owner.email } });
  const request = apiRequest("/api/analyze", "owner");
  const user = await verifyExternalUser(request, authEnvironment, authFetch);
  const response = await analyzeForUser(request, user, db);
  assert.equal(response.status, 200);
  const lookup = db.calls.find((call) => call.method === "first");
  assert.deepEqual(lookup.bindings, [identities.owner.email]);
  assert.match(lookup.sql, /WHERE creator_email = \?/i);
  assert.match(lookup.sql, /ORDER BY created_at DESC, id DESC LIMIT 1/i);
});

test("analyze latest selection has a normal empty state when the owner has no ideas", async () => {
  const request = apiRequest("/api/analyze", "owner");
  const user = await verifyExternalUser(request, authEnvironment, authFetch);
  const response = await analyzeForUser(request, user, new MockD1());
  assert.equal(response.status, 404);
});

test("validation discovery exposes only public published fields with real response counts", async () => {
  const visible = {
    id: 21,
    title: "Public idea",
    description: "A public validation",
    category: "Climate",
    status: "published",
    study_type: "idea",
    reward_points: 35,
    signal_score: 71,
    survey_json: "[]",
    response_count: 4,
  };
  const db = new MockD1({ validations: [visible] });
  const request = apiRequest("/api/validations", "contributor");
  const user = await verifyExternalUser(request, authEnvironment, authFetch);
  const response = await getPublishedValidations(user, db);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.validations, [visible]);
  assert.equal(body.validations[0].response_count, 4);
  assert.equal("creator_email" in body.validations[0], false);
  assert.equal("contributor_email" in body.validations[0], false);
  const discovery = db.calls.find((call) => /FROM validations v/i.test(call.sql));
  assert.match(discovery.sql, /status = 'published' AND v\.visibility = 'public'/i);
  assert.match(discovery.sql, /SELECT COUNT\(\*\) FROM responses/i);
  assert.doesNotMatch(discovery.sql, /SELECT v\.\*/i);
  assert.deepEqual(discovery.bindings, []);
});

test("validation discovery rejects unauthenticated requests", async () => {
  const response = await getPublishedValidations(null, new MockD1());
  assert.equal(response.status, 401);
});

test("registration requires a complete, error-free Supabase session", () => {
  assert.equal(hasVerifiedSupabaseSession(undefined), false);
  assert.equal(hasVerifiedSupabaseSession({ data: { session: null } }), false);
  assert.equal(hasVerifiedSupabaseSession({ data: { session: { access_token: "token", user: {} } } }), false);
  assert.equal(hasVerifiedSupabaseSession({ data: { session: { access_token: "token", user: { id: "user-id" } } }, error: new Error("expired") }), false);
  assert.equal(hasVerifiedSupabaseSession({ data: { session: { access_token: "token", user: { id: "user-id" } } } }), true);
});

test("discovery uses demo only for a successful empty response", () => {
  assert.equal(discoveryModeForResponse(true, 0), "demo");
  assert.equal(discoveryModeForResponse(true, 2), "live");
  for (const status of [401, 403, 500]) {
    assert.equal(discoveryModeForResponse(status >= 200 && status < 300, 0), "error");
  }
});
