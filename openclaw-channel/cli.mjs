#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(packageRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const packageName = packageJson.name ?? "@xiaozhi_openclaw/xiaozhi";
const packageVersion = packageJson.version ?? "0.0.0";
const pluginId = "xiaozhi";
const defaultAccountId = "default";
const openclawBin = process.env.OPENCLAW_BIN?.trim() || "openclaw";
const resolvedOpenclawBin = resolveCommandPath(openclawBin);

function printUsage() {
  console.log(`${packageName} v${packageVersion}

Usage:
  npx -y ${packageName}@latest install
  npx -y ${packageName}@latest install --dry-run
  npx -y ${packageName}@latest install --link
  npx -y ${packageName}@latest doctor
  npx -y ${packageName}@latest setup --url <ws-url> --token <jwt>
  npx -y ${packageName}@latest --help

Commands:
  install     Install the bundled OpenClaw plugin from the current package directory.
  doctor      Print OpenClaw/plugin registry diagnostics for this package.
  setup       Write channels.xiaozhi config directly into openclaw.json.

Options:
  --dry-run   Print the commands without changing anything.
  --link      Use \`openclaw plugins install --link\` for local development.
  --url       XiaoZhi WebSocket URL for \`setup\`.
  --token     XiaoZhi JWT token for \`setup\`.
  --account   Account id for \`setup\` (default: \`default\`).
  --name      Optional display name for \`setup\`.
  --config-file
              Override the OpenClaw config file path for \`setup\`.
  -h, --help  Show this help text.
  -v, --version
              Show the package version.

Environment:
  OPENCLAW_BIN         Override the OpenClaw executable name or path.
  OPENCLAW_CONFIG_FILE Override the OpenClaw config file path used by \`setup\`.
  OPENCLAW_CONFIG_DIR  Override the default config dir used for cleanup.
  OPENCLAW_STATE_DIR   Override the default state dir used for cleanup.`);
}

function quoteArg(value) {
  if (!value) {
    return '""';
  }
  return /[\s"]/u.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function formatCommand(file, args) {
  return [file, ...args].map(quoteArg).join(" ");
}

function resolveCommandPath(file) {
  const hasPathSeparator = file.includes("/") || file.includes("\\");
  if (hasPathSeparator || path.isAbsolute(file)) {
    return fs.existsSync(file) ? path.resolve(file) : null;
  }

  const pathEnv = process.env.PATH ?? "";
  const pathDirs = pathEnv.split(path.delimiter).filter(Boolean);
  const extensions =
    process.platform === "win32"
      ? (process.env.PATHEXT?.split(";").filter(Boolean) ?? [".EXE", ".CMD", ".BAT", ".COM"])
      : [""];

  for (const dirPath of pathDirs) {
    if (process.platform === "win32") {
      const hasExtension = Boolean(path.extname(file));
      const candidates = hasExtension ? [file] : [file, ...extensions.map((ext) => `${file}${ext.toLowerCase()}`)];
      for (const candidateName of candidates) {
        const candidatePath = path.join(dirPath, candidateName);
        if (fs.existsSync(candidatePath)) {
          return candidatePath;
        }
      }
      continue;
    }

    const candidatePath = path.join(dirPath, file);
    try {
      fs.accessSync(candidatePath, fs.constants.X_OK);
      return candidatePath;
    } catch {
      // Keep searching PATH.
    }
  }

  return null;
}

function runCommand(file, args, options = {}) {
  const result = spawnSync(file, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    if (options.allowFailure) {
      return { ok: false, code: result.status ?? 1, error: result.error };
    }

    if (result.error.code === "ENOENT") {
      console.error(`Unable to find "${file}" in PATH. Install OpenClaw first or set OPENCLAW_BIN.`);
    } else {
      console.error(result.error.message);
    }
    process.exit(result.status ?? 1);
  }

  const ok = result.status === 0;
  if (!ok && !options.allowFailure) {
    process.exit(result.status ?? 1);
  }

  return {
    ok,
    code: result.status ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

function getFlagValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

function canonicalizeAccountId(value) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "")
    .slice(0, 64);

  if (!normalized || normalized === "__proto__" || normalized === "prototype" || normalized === "constructor") {
    return defaultAccountId;
  }

  return normalized;
}

function normalizeAccountId(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return defaultAccountId;
  }
  return canonicalizeAccountId(trimmed);
}

function resolveConfigFilePath(overridePath) {
  const directPath = overridePath?.trim() || process.env.OPENCLAW_CONFIG_FILE?.trim();
  if (directPath) {
    return path.resolve(directPath);
  }

  const configDir = process.env.OPENCLAW_CONFIG_DIR?.trim();
  if (configDir) {
    return path.join(path.resolve(configDir), "openclaw.json");
  }

  return path.join(os.homedir(), ".openclaw", "openclaw.json");
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("OpenClaw config must be a JSON object.");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to parse ${filePath}: ${message}`);
    process.exit(1);
  }
}

function hasConfiguredXiaozhiAccounts(cfg) {
  const accounts = cfg.channels?.[pluginId]?.accounts;
  return Boolean(accounts && typeof accounts === "object" && Object.keys(accounts).length > 0);
}

function applyXiaozhiAccountName(cfg, accountId, name) {
  const trimmed = name?.trim();
  if (!trimmed) {
    return cfg;
  }

  const channel = cfg.channels?.[pluginId] ?? {};
  if (accountId === defaultAccountId && !hasConfiguredXiaozhiAccounts(cfg)) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        [pluginId]: {
          ...channel,
          name: trimmed,
        },
      },
    };
  }

  const accounts = channel.accounts ?? {};
  const existingAccount = accounts[accountId] ?? {};
  const baseWithoutTopLevelName =
    accountId === defaultAccountId
      ? (({ name: _ignored, ...rest }) => rest)(channel)
      : channel;

  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      [pluginId]: {
        ...baseWithoutTopLevelName,
        accounts: {
          ...accounts,
          [accountId]: {
            ...existingAccount,
            name: trimmed,
          },
        },
      },
    },
  };
}

function migrateBaseNameToDefaultAccount(cfg) {
  const channel = cfg.channels?.[pluginId];
  const baseName = channel?.name?.trim();
  if (!baseName) {
    return cfg;
  }

  const accounts = { ...(channel.accounts ?? {}) };
  const existingDefault = accounts[defaultAccountId] ?? {};
  if (!existingDefault.name) {
    accounts[defaultAccountId] = {
      ...existingDefault,
      name: baseName,
    };
  }

  const { name: _ignored, ...rest } = channel;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      [pluginId]: {
        ...rest,
        accounts,
      },
    },
  };
}

function applyXiaozhiSetup(cfg, params) {
  const accountId = normalizeAccountId(params.accountId);
  let next = applyXiaozhiAccountName(cfg, accountId, params.name);
  if (accountId !== defaultAccountId) {
    next = migrateBaseNameToDefaultAccount(next);
  }

  const channel = next.channels?.[pluginId] ?? {};
  const useAccounts = accountId !== defaultAccountId || hasConfiguredXiaozhiAccounts(next);

  if (!useAccounts) {
    return {
      ...next,
      channels: {
        ...next.channels,
        [pluginId]: {
          ...channel,
          enabled: true,
          url: params.url,
          token: params.token,
        },
      },
    };
  }

  const accounts = channel.accounts ?? {};
  const existingAccount = accounts[accountId] ?? {};

  return {
    ...next,
    channels: {
      ...next.channels,
      [pluginId]: {
        ...channel,
        enabled: channel.enabled ?? true,
        accounts: {
          ...accounts,
          [accountId]: {
            ...existingAccount,
            enabled: true,
            url: params.url,
            token: params.token,
          },
        },
      },
    },
  };
}

function writeJsonFile(filePath, value) {
  const parentDir = path.dirname(filePath);
  fs.mkdirSync(parentDir, { recursive: true });

  if (fs.existsSync(filePath)) {
    const backupPath = `${filePath}.bak`;
    fs.copyFileSync(filePath, backupPath);
    console.log(`Backed up existing config to ${backupPath}`);
  }

  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveResidualPluginDirs() {
  const dirs = [];
  const configDir = process.env.OPENCLAW_CONFIG_DIR?.trim();
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim();

  if (configDir) {
    dirs.push(path.join(configDir, "extensions", pluginId));
  }
  if (stateDir) {
    dirs.push(path.join(stateDir, "extensions", pluginId));
  }

  dirs.push(path.join(os.homedir(), ".openclaw", "extensions", pluginId));

  return dedupe(dirs);
}

function removeResidualPluginDirs(dirs, dryRun) {
  for (const dirPath of dirs) {
    if (!fs.existsSync(dirPath)) {
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] remove ${dirPath}`);
      continue;
    }
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`Removed stale plugin directory: ${dirPath}`);
  }
}

function parseInstallFlags(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    link: argv.includes("--link"),
  };
}

function printInstallerContext() {
  console.log(`Installer package: ${packageName}@${packageVersion}`);
  console.log(`Plugin source: ${packageRoot}`);
  console.log(`OpenClaw executable: ${resolvedOpenclawBin ?? `(not found in PATH: ${openclawBin})`}`);
}

function printConfigSetInstructions() {
  console.log(`openclaw config set channels.${pluginId}.enabled true --strict-json`);
  console.log(`openclaw config set channels.${pluginId}.url "<ws-url>"`);
  console.log(`openclaw config set channels.${pluginId}.token "<jwt>"`);
}

function runDoctor() {
  printInstallerContext();

  const commands = [
    { label: "OpenClaw version", file: openclawBin, args: ["--version"], allowFailure: false },
    { label: "Installed plugins", file: openclawBin, args: ["plugins", "list", "--json"], allowFailure: true },
    { label: "Plugin doctor", file: openclawBin, args: ["plugins", "doctor"], allowFailure: true },
    {
      label: "Channel capabilities",
      file: openclawBin,
      args: ["channels", "capabilities", "--channel", pluginId, "--json"],
      allowFailure: true,
    },
  ];

  let sawPlugin = false;
  let channelCapabilitiesOk = false;

  for (const command of commands) {
    console.log(`\n== ${command.label} ==`);
    console.log(formatCommand(command.file, command.args));
    const result = runCommand(command.file, command.args, { allowFailure: command.allowFailure });
    const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const lowerOutput = combinedOutput.toLowerCase();
    if (lowerOutput.includes(`"${pluginId}"`) || lowerOutput.includes(` ${pluginId} `) || lowerOutput.includes(`:${pluginId}`)) {
      if (command.label === "Installed plugins") {
        sawPlugin = true;
      }
    }
    if (command.label === "Channel capabilities" && result.ok && !lowerOutput.includes("unknown channel")) {
      channelCapabilitiesOk = true;
    }
  }

  console.log("\n== Summary ==");
  console.log(`Plugin id present in \`plugins list\`: ${sawPlugin ? "yes" : "no"}`);
  console.log(`\`openclaw channels capabilities --channel ${pluginId}\` succeeds: ${channelCapabilitiesOk ? "yes" : "no"}`);
  if (!sawPlugin || !channelCapabilitiesOk) {
    console.log(
      "If the plugin shows up in `plugins list` but capabilities still fail, you are likely running a different OpenClaw binary or the plugin failed during load.",
    );
    process.exit(2);
  }

  console.log(
    `If \`openclaw channels add --channel ${pluginId} ...\` still says "Unknown channel", configure it with \`openclaw config set\` instead:`,
  );
  printConfigSetInstructions();
}

function runInstall(argv) {
  const { dryRun, link } = parseInstallFlags(argv);
  const installArgs = ["plugins", "install"];
  if (link) {
    installArgs.push("--link");
  }
  installArgs.push(packageRoot);

  const cleanupDirs = resolveResidualPluginDirs();

  printInstallerContext();

  const commands = [
    { file: openclawBin, args: ["--version"], allowFailure: false },
    { file: openclawBin, args: ["plugins", "uninstall", pluginId, "--force"], allowFailure: true },
    { file: openclawBin, args: installArgs, allowFailure: false },
  ];

  if (dryRun) {
    for (const command of commands) {
      console.log(`[dry-run] ${formatCommand(command.file, command.args)}`);
    }
    removeResidualPluginDirs(cleanupDirs, true);
    return;
  }

  runCommand(commands[0].file, commands[0].args);
  runCommand(commands[1].file, commands[1].args, { allowFailure: true });
  removeResidualPluginDirs(cleanupDirs, false);
  runCommand(commands[2].file, commands[2].args);

  console.log(`Installed plugin "${pluginId}" from ${link ? "linked source" : "local package"}: ${packageRoot}`);
  console.log("Restart the gateway to load the updated plugin.");
  console.log(`Configure the channel with:`);
  printConfigSetInstructions();
  console.log(`If you need diagnostics, run:`);
  console.log(`  node ${quoteArg(path.join(packageRoot, "cli.mjs"))} doctor`);
}

function parseSetupFlags(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
    url: getFlagValue(argv, "--url")?.trim(),
    token: getFlagValue(argv, "--token")?.trim(),
    accountId: normalizeAccountId(getFlagValue(argv, "--account")),
    name: getFlagValue(argv, "--name"),
    configFile: getFlagValue(argv, "--config-file"),
  };
}

function runSetup(argv) {
  const { dryRun, url, token, accountId, name, configFile } = parseSetupFlags(argv);
  if (!url) {
    console.error("Missing required flag: --url");
    process.exit(1);
  }
  if (!token) {
    console.error("Missing required flag: --token");
    process.exit(1);
  }

  const resolvedConfigFile = resolveConfigFilePath(configFile);
  const currentConfig = readJsonFile(resolvedConfigFile);
  const nextConfig = applyXiaozhiSetup(currentConfig, {
    accountId,
    name,
    url,
    token,
  });

  printInstallerContext();
  console.log(`OpenClaw config file: ${resolvedConfigFile}`);
  console.log(`Target account: ${accountId}`);

  if (dryRun) {
    console.log("\n[dry-run] channels.xiaozhi preview:");
    console.log(JSON.stringify(nextConfig.channels?.[pluginId] ?? {}, null, 2));
    return;
  }

  writeJsonFile(resolvedConfigFile, nextConfig);
  console.log(`Updated channels.${pluginId} in ${resolvedConfigFile}`);
  console.log("Restart the gateway to load the updated channel config.");
}

const argv = process.argv.slice(2);
const command = argv[0];

if (!command || command === "-h" || command === "--help" || command === "help") {
  printUsage();
  process.exit(0);
}

if (command === "-v" || command === "--version" || command === "version") {
  console.log(packageVersion);
  process.exit(0);
}

if (command === "install") {
  runInstall(argv.slice(1));
  process.exit(0);
}

if (command === "setup") {
  runSetup(argv.slice(1));
  process.exit(0);
}

if (command === "doctor") {
  runDoctor();
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
printUsage();
process.exit(1);
