/**
 * Supabase/API errors are not always Error instances with a string `message` — some
 * responses yield an object whose `message` is itself an object, which React renders as
 * `{}`. Pull out the first usable string instead.
 */
export function errorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (typeof err === "string" && err.trim()) return err.trim();

  if (err instanceof Error && typeof err.message === "string" && err.message.trim()) {
    return err.message.trim();
  }

  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    for (const key of ["message", "msg", "error_description", "detail", "error"]) {
      const value = obj[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (value && typeof value === "object") {
        const nested = errorMessage(value, "");
        if (nested) return nested;
      }
    }
  }

  return fallback;
}
