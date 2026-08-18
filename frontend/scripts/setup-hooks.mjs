// Point this clone's git hooks at the tracked .githooks/ directory.
//
// Git deliberately never runs hooks straight out of a clone (that would be
// arbitrary code execution on `git clone`), so core.hooksPath has to be set
// once per clone. Running it from npm's `prepare` lifecycle makes that
// automatic for anyone who does an `npm install`.
//
// This must NEVER fail the install: production builds run `npm ci` in
// environments that may have no git, no .git directory, or no hooks to wire
// up. Every failure path is swallowed and we always exit 0.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const run = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

try {
  const root = run("rev-parse", "--show-toplevel");
  if (!existsSync(join(root, ".githooks"))) {
    process.exit(0); // nothing to wire up
  }
  const current = (() => {
    try {
      return run("config", "--get", "core.hooksPath");
    } catch {
      return ""; // unset -> git exits 1
    }
  })();
  if (current !== ".githooks") {
    run("config", "core.hooksPath", ".githooks");
    console.log("git hooks -> .githooks (commit identity check enabled)");
  }
} catch {
  // No git, no repo, detached build context: not our problem, carry on.
}
process.exit(0);
