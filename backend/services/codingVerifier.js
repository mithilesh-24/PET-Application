/**
 * Extension point for coding test verification on paper import.
 * Stub implementation until M9 replaces it with sandboxed generator & reference checks.
 */
export async function verifyCodingTests(_paper) {
  return {
    ok: true,
    failures: [],
    warnings: [],
  };
}
