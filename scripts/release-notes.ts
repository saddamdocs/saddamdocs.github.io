/**
 * Writes the body of a GitHub Release (PLAN 9, `release.yml`): the version, the schema version of
 * PLAN 5.3 (which decides whether an older release is safe to put back), the commit, the SHA-256 of
 * the asset, and how to deploy it.
 *
 * Usage: `node scripts/release-notes.ts <tag> <sha256>`. Prints Markdown on stdout.
 * Fails when the tag does not match the version in package.json.
 *
 * Talks to: package.json and `src/lib/config.ts`.
 */

import { readFileSync } from 'node:fs';
import { SCHEMA_VERSION } from '../src/lib/config.ts';

const [tag, sha256] = process.argv.slice(2);
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

if (tag === undefined || sha256 === undefined) {
  console.error('Usage: node scripts/release-notes.ts <tag> <sha256>');
  process.exit(1);
}
if (tag !== `v${pkg.version}`) {
  console.error(`Tag ${tag} does not match package.json version ${pkg.version}`);
  process.exit(1);
}

console.log(`Tamanduá ${pkg.version}, stable channel.

- **Schema version:** ${String(SCHEMA_VERSION)}. An older release is safe to put back only if its schema version is the same (PLAN 9).
- **Commit:** ${process.env.GITHUB_SHA ?? 'unknown'}
- **Asset:** \`tamandua-stable.zip\`, SHA-256 \`${sha256}\`

To deploy: in the stable repository, Actions → "Deploy stable" → Run workflow, and enter \`${tag}\`.
See CHANGELOG.md for what changed.`);
