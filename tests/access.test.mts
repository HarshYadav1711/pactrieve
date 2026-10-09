import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
  accessGateEnabled,
  accessGateMisconfigured,
  configuredAccessToken,
  describeAccessGate,
  extractBearerToken,
  isHostedPublicSurface,
  publicServerError,
  requestHasValidAccess,
  tokensEqual
} from "../src/lib/access.ts";

describe("deployment access gate", () => {
  it("is disabled when token env is unset", () => {
    assert.equal(accessGateEnabled({}), false);
    assert.equal(configuredAccessToken({}), null);
    assert.equal(
      requestHasValidAccess({authorizationHeader: null, cookieValue: null, env: {}}),
      true
    );
  });

  it("requires matching bearer or cookie when configured", () => {
    const env = {PACTRIEVE_ACCESS_TOKEN: "eval-secret-42"};
    assert.equal(accessGateEnabled(env), true);
    assert.equal(
      requestHasValidAccess({authorizationHeader: null, cookieValue: null, env}),
      false
    );
    assert.equal(
      requestHasValidAccess({
        authorizationHeader: "Bearer eval-secret-42",
        cookieValue: null,
        env
      }),
      true
    );
    assert.equal(
      requestHasValidAccess({
        authorizationHeader: null,
        cookieValue: "eval-secret-42",
        env
      }),
      true
    );
    assert.equal(
      requestHasValidAccess({
        authorizationHeader: "Bearer wrong",
        cookieValue: "also-wrong",
        env
      }),
      false
    );
  });

  it("rejects length-mismatched tokens without accepting", () => {
    assert.equal(tokensEqual("abc", "abcd"), false);
    assert.equal(tokensEqual("same", "same"), true);
    assert.equal(tokensEqual("same", "samx"), false);
  });

  it("parses Bearer headers only", () => {
    assert.equal(extractBearerToken("Bearer tok"), "tok");
    assert.equal(extractBearerToken("bearer  tok  "), "tok");
    assert.equal(extractBearerToken("Basic x"), null);
    assert.equal(extractBearerToken(null), null);
  });

  it("publicServerError never returns raw stacks by default", () => {
    assert.equal(publicServerError("safe"), "safe");
    assert.equal(
      publicServerError("safe", Object.assign(new Error("ECONNREFUSED supabase"), {})),
      "safe"
    );
    assert.equal(
      publicServerError("safe", {publicMessage: "Document not ready."}),
      "Document not ready."
    );
  });

  it("whitespace-only access env does not enable the gate", () => {
    assert.equal(accessGateEnabled({PACTRIEVE_ACCESS_TOKEN: "   "}), false);
  });

  it("hosted public surface fails closed when token is missing", () => {
    assert.equal(isHostedPublicSurface({}), false);
    assert.equal(isHostedPublicSurface({VERCEL: "1"}), true);
    assert.equal(isHostedPublicSurface({PACTRIEVE_ENFORCE_ACCESS_GATE: "true"}), true);
    assert.equal(accessGateMisconfigured({VERCEL: "1"}), true);
    assert.equal(accessGateMisconfigured({VERCEL: "1", PACTRIEVE_ACCESS_TOKEN: "x"}), false);
    assert.equal(accessGateMisconfigured({}), false);
    assert.deepEqual(describeAccessGate({VERCEL: "1"}), {
      required: true,
      misconfigured: true
    });
    assert.deepEqual(describeAccessGate({PACTRIEVE_ACCESS_TOKEN: "tok"}), {
      required: true,
      misconfigured: false
    });
    assert.deepEqual(describeAccessGate({}), {required: false, misconfigured: false});
  });
});
