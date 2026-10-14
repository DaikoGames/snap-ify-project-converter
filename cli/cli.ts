// Offline CLI: node cli.js project.catrobat project.xml
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { DOMParser } from "linkedom";
import { convertCatrobatXml, readCatrobatArchive } from "../src/lib/catrobat-to-snap";

(globalThis as any).DOMParser = DOMParser;

async function main() {
  const [input, outArg] = process.argv.slice(2);
  if (!input || input === "-h" || input === "--help") {
    console.log("Usage: node cli.js <project.catrobat | code.xml> [output.xml]");
    process.exit(input ? 0 : 1);
  }
  const buf = readFileSync(input);
  const file = new File([buf], basename(input));
  const { xml, media } = await readCatrobatArchive(file);
  const r = convertCatrobatXml(xml, media);
  const out = outArg ?? input.replace(/\.(catrobat|zip|xml)$/i, "") + ".snap.xml";
  writeFileSync(out, r.xml);
  const l = r.log;
  console.log(
    `✔ ${r.projectName}: ${l.sprites} sprites, ${l.scripts} scripts, ${l.bricks} bricks, ${l.costumes} costumes, ${l.sounds} sounds → ${out}`,
  );
  for (const [k, n] of Object.entries(l.unsupported)) console.log(`  ! unsupported ${k} × ${n}`);
  for (const w of l.warnings) console.log(`  ! ${w}`);
}

main().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exit(1);
});
