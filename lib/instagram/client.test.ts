// Unit tests for GraphApiError's isTokenError detection. This is the one piece of client.ts that
// benefits from a dedicated test file — everything else in client.ts makes real Graph API calls
// and is validated by the smoke tests instead (see the Prompt 3/6 reports), consistent with this
// project's existing rule of not calling Meta from unit tests. isTokenError is pure constructor
// logic (read a `code` value, compare to 190), so it's fully testable without any I/O.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { GraphApiError } from "./client.ts";

describe("GraphApiError — isTokenError detection", () => {
  test("Meta error code 190 (OAuthException) sets isTokenError: true", () => {
    const err = new GraphApiError("Error validating access token: Session has expired", 401, {
      type: "OAuthException",
      code: 190,
      fbtraceId: "AiyjQ4wIn9UmUr6W0hZi65a",
    });
    assert.equal(err.isTokenError, true);
  });

  test("a different Meta error code (e.g. 100, GraphMethodException) sets isTokenError: false", () => {
    const err = new GraphApiError(
      "Unsupported get request. Object with ID '0' does not exist",
      400,
      { type: "GraphMethodException", code: 100 }
    );
    assert.equal(err.isTokenError, false);
  });

  test("no code at all (e.g. a timeout/network-level GraphApiError with no Meta error body) is not a token error", () => {
    const err = new GraphApiError('Graph API request to "x" timed out', 504);
    assert.equal(err.isTokenError, false);
  });

  test("detection is by code alone — an unexpected type alongside code 190 is still flagged", () => {
    const err = new GraphApiError("odd combination", 401, { code: 190 });
    assert.equal(err.isTokenError, true);
  });

  test("adding isTokenError does not disturb the error's other fields", () => {
    const err = new GraphApiError("Session has expired", 401, {
      type: "OAuthException",
      code: 190,
      fbtraceId: "xyz",
    });
    assert.equal(err.status, 401);
    assert.equal(err.type, "OAuthException");
    assert.equal(err.code, 190);
    assert.equal(err.fbtraceId, "xyz");
    assert.equal(err.message, "Session has expired");
    assert.equal(err.name, "GraphApiError");
  });
});
