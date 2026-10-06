#!/usr/bin/env node
// PreToolUse guard for the Bash tool (wired in .claude/settings.json).
// Blocks git operations that could lose work or ship untested code, and runs the
// quality gate (`npm run check`) before any commit. Exit 2 = block; stderr goes to Claude.
import { execSync } from 'node:child_process';

let raw = '';
process.stdin.on('data', d => { raw += d; });
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  const cmd = String(input?.tool_input?.command ?? '');
  const cwd = input?.cwd || process.cwd();
  const block = msg => { process.stderr.write(msg + '\n'); process.exit(2); };

  // Look at each shell segment separately: `a && git push origin main` etc.
  for (const seg of cmd.split(/&&|\|\||;|\n|\|/).map(s => s.trim())) {
    const m = seg.match(/\bgit\s+(.*)$/);
    if (!m) continue;
    let args = m[1].split(/\s+/).filter(Boolean);
    let gitCwd = cwd;
    // skip global options such as `git -C <dir>` / `git -c key=val`
    while (args.length && args[0].startsWith('-')) {
      const opt = args.shift();
      if ((opt === '-C' || opt === '-c') && args.length) { const v = args.shift(); if (opt === '-C') gitCwd = v; }
    }
    const sub = args[0];

    if (sub === 'push') {
      if (args.some(a => a === '-f' || a.startsWith('--force') || /^\+/.test(a) || /^-[a-zA-Z]*f/.test(a) && !a.startsWith('--'))) {
        block('Blocked by .claude/hooks/guard-bash.mjs: force-push is not allowed. Push a new commit instead.');
      }
      if (args.some(a => /^(main|master)$/.test(a) || /:(refs\/heads\/)?(main|master)$/.test(a))) {
        block('Blocked: never push to main. Push your feature branch and open a PR (gh pr create); Aiden merges, and merging deploys.');
      }
      let branch = '';
      try { branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: gitCwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
      const refs = args.slice(1).filter(a => !a.startsWith('-')).slice(1); // after <remote>
      const pushesCurrent = refs.length === 0 || refs.some(r => r === 'HEAD' || r.startsWith('HEAD:'));
      if ((branch === 'main' || branch === 'master') && pushesCurrent) {
        block('Blocked: you are on main. Create a branch (git switch -c feat/<id>-<slug>) and push that instead.');
      }
    }
    if (args.includes('--no-verify')) block('Blocked: --no-verify skips the quality gate.');
    if (sub === 'reset' && args.includes('--hard')) block('Blocked: git reset --hard throws away work. Ask Aiden first.');
    if (sub === 'clean' && args.some(a => /^-[a-zA-Z]*f/.test(a))) block('Blocked: git clean -f deletes untracked files. Ask Aiden first.');
    if (sub === 'checkout' && args.includes('--') && args.includes('.')) block('Blocked: `git checkout -- .` discards all local changes. Ask Aiden first.');

    if (sub === 'commit') {
      try {
        execSync('npm run -s check', { cwd: gitCwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 280_000 });
      } catch (e) {
        const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.split('\n').slice(-40).join('\n');
        block('Blocked: `npm run check` failed, so this commit would put broken code on the branch. Fix it, then commit.\n' + out);
      }
    }
  }
  process.exit(0);
});
