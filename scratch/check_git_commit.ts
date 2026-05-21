import { execSync } from 'child_process';

function runGit(cmd: string) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch (e: any) {
    return `ERROR: ${e.message}`;
  }
}

async function main() {
  console.log("=== DIAGNOSTIC GIT ===");

  console.log("\n1. Branche courante (Local) :");
  console.log(runGit("git branch --show-current"));

  console.log("\n2. Derniers commits sur la branche courante :");
  console.log(runGit("git log -n 5 --oneline"));

  console.log("\n3. Recherche du commit par message 'feat: track partial cash collections on deliveries' :");
  console.log(runGit('git log --all --grep="feat: track partial cash collections on deliveries" --oneline'));

  console.log("\n4. Recherche du commit par hash 'a1755bf' :");
  console.log(runGit("git show a1755bf --oneline"));

  console.log("\n5. Statut local vs distant (git status) :");
  console.log(runGit("git status -uno"));

  console.log("\n6. Comparaison avec origin/main :");
  const localMain = runGit("git rev-parse HEAD");
  const remoteMain = runGit("git rev-parse origin/main");
  console.log(`Local HEAD: ${localMain}`);
  console.log(`Remote origin/main: ${remoteMain}`);
}

main();
