import { Command } from "commander";
import Table from "cli-table3";
import chalk from "chalk";
import {
  loadAccounts,
  saveAccounts,
  setActiveAccount,
  getActiveAccount,
  loadConfig,
  isAuthenticated,
} from "../config.js";
import { printSuccess, printError, printInfo, printEnvelope } from "../output/index.js";
import type { Account } from "../models.js";

export function registerAccountCommands(program: Command): void {
  const accountsCmd = program
    .command("accounts")
    .description("List all saved accounts")
    .option("--json", "JSON output")
    .action((opts: { json?: boolean }) => {
      const accounts = loadAccounts();
      if (opts.json) {
        printEnvelope(accounts);
        return;
      }
      if (accounts.length === 0) {
        printInfo("No accounts saved. Use: tkt accounts add <name>");
        return;
      }
      const t = new Table({
        head: [
          chalk.cyan("Active"),
          chalk.cyan("Name"),
          chalk.cyan("Has Session"),
          chalk.cyan("Has msToken"),
          chalk.cyan("Added"),
        ],
        style: { head: [], border: ["grey"] },
      });
      for (const a of accounts) {
        t.push([
          a.isActive ? chalk.green("*") : "",
          a.isActive ? chalk.green(a.name) : a.name,
          a.credential.sessionid ? "yes" : "no",
          a.credential.msToken ? "yes" : "no",
          new Date(a.addedAt).toLocaleDateString(),
        ]);
      }
      console.log(t.toString());
    });

  accountsCmd
    .command("add <name>")
    .description("Save current credentials as a named account")
    .action((name: string) => {
      if (!isAuthenticated()) {
        printError("Not authenticated. Run: tkt login");
        process.exit(1);
      }
      // Read the raw stored credential, not loadCredential() — the latter
      // prefers the active account, which would save the wrong creds after
      // `accounts switch X` followed by a fresh `tkt login`.
      const credential = loadConfig().credential;
      if (!credential) {
        printError("No credential found. Run: tkt login");
        process.exit(1);
      }
      const accounts = loadAccounts();
      if (accounts.find((a) => a.name === name)) {
        printError(`Account "${name}" already exists.`);
        process.exit(1);
      }
      const account: Account = {
        name,
        credential,
        isActive: false,
        addedAt: Date.now(),
      };
      accounts.push(account);
      saveAccounts(accounts);
      printSuccess(`Account "${name}" saved.`);
    });

  accountsCmd
    .command("switch <name>")
    .description("Switch to a named account")
    .action((name: string) => {
      try {
        setActiveAccount(name);
        printSuccess(`Switched to account "${name}".`);
      } catch (e) {
        printError(String(e instanceof Error ? e.message : e));
        process.exit(1);
      }
    });

  accountsCmd
    .command("remove <name>")
    .description("Remove a named account")
    .action((name: string) => {
      const accounts = loadAccounts();
      const filtered = accounts.filter((a) => a.name !== name);
      if (filtered.length === accounts.length) {
        printError(`Account "${name}" not found.`);
        process.exit(1);
      }
      saveAccounts(filtered);
      printSuccess(`Account "${name}" removed.`);
    });
}
