/**
 * Validation for the `?next=` destination carried through sign-in.
 *
 * Its own module so it can be exercised directly: the value is
 * attacker-controllable through a crafted link and is handed to
 * window.location.assign() once sign-in succeeds, so getting it wrong turns the
 * login page into an open redirect — a working JSAN URL that deposits the user
 * on somebody else's site immediately after they type their password, which is
 * exactly the shape a phishing flow wants.
 *
 * Allow only absolute paths on this origin. Everything else becomes "/".
 */

/** NUL..US and DEL. Checked by code point rather than with a regex character
 *  class, which would put invisible literal control bytes in this file. */
function hasControlChars(v: string): boolean {
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

export function safeNext(raw: string | string[] | undefined): string {
  // Repeated query keys arrive as an array; take the first and judge it on its
  // own merits rather than trusting either.
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string" || v === "") return "/";

  // Must start with a single slash:
  //   "https://evil.test"  absolute, different origin
  //   "//evil.test"        protocol-relative, resolves off-origin
  //   "/\evil.test"        browsers normalise "\" to "/", so also off-origin
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return "/";

  // Control characters can split the value apart once it reaches the browser
  // or a log line.
  if (hasControlChars(v)) return "/";

  return v;
}
