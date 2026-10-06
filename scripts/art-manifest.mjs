// Lists which cards have art in client/public/art so the game knows without probing every file.
// Runs automatically before every build (npm run build) and dev session (npm run dev).
import { readdirSync, writeFileSync } from 'node:fs';
const dir = new URL('../client/public/art/', import.meta.url);
const files = readdirSync(dir)
  .filter(f => /\.(webp|png|jpe?g)$/i.test(f) && !/^(p-|sh-|grain)/.test(f) && !/-e[01]\.\w+$/.test(f))
  .sort();
writeFileSync(new URL('manifest.json', dir), JSON.stringify({ art: files }, null, 1));
console.log(`art manifest: ${files.length} cards with art`);
