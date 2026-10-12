/**
 * Creates the ACCESS_CODE_HASH for the private knowledge tier.
 *
 *   npm run hash-code                 generates a fresh code and its hash
 *   npm run hash-code -- "MEIN CODE"  hashes a code of your choice
 *
 * Put the code into the application email and only the hash into the server env.
 */
import { randomInt } from "node:crypto";
import { hashAccessCode, normalizeAccessCode } from "../src/server/security/access-code.ts";

const WORDS = [
  "ZAPFHAHN",
  "KICKER",
  "AMIGA",
  "BOOMERANG",
  "JOYSTICK",
  "DISKETTE",
  "AIRHOCKEY",
  "PADEL",
  "LIMMAT",
  "BARISTA",
  "HOODIE",
  "DEPLOY",
  "COMMIT",
  "SPRITE",
  "PIXEL",
  "SCHAUM",
  "PILS",
  "LAGER",
  "HOPFEN",
  "MALZ",
  "DATASETTE",
  "BASIC",
  "READY",
  "PROST",
  "DIETIKON",
  "MEME",
  "HACKATHON",
  "WAKEBOARD",
  "RASTER",
  "BORDER",
  "CURSOR",
  "TURBO",
];

function generateCode(): string {
  const pick = () => WORDS[randomInt(WORDS.length)];
  return `${pick()} ${pick()} ${pick()} ${randomInt(1000, 10000)}`;
}

const given = process.argv.slice(2).join(" ").trim();
const code = given || generateCode();
const hash = await hashAccessCode(code);

console.log(`
  Access code (for the email, case does not matter):
    ${normalizeAccessCode(code)}

  Server env:
    ACCESS_CODE_HASH=${hash}
`);
