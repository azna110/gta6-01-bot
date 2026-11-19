// Velvet Bay — the entry program for make.fun's gta6-01 bounty.
// It hands the game in: copies game/ and screenshots/ from this repository
// into the output directory and writes the dossier buildDossier builds from
// them, exactly as the kit's library writes it. Node 22, standard library
// only; no network, no install, nothing but files in and files out.

import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory this file lives in; in the grader
// that is the read-only /bot, and locally it is the checked-out repo.
const repoRoot = dirname(fileURLToPath(import.meta.url));
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
for (const name of ['game', 'screenshots']) {
  cpSync(join(repoRoot, name), join(outDir, name), { recursive: true });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
