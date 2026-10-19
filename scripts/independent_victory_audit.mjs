import fs from "node:fs";
import path from "node:path";

const EXTRACTED_DIR = path.resolve("d:/TokeX/t3codeexp/extracted_ui");

console.log("=== INDEPENDENT VICTORY AUDITOR FORENSIC SUITE ===");
console.log(`Auditing target: ${EXTRACTED_DIR}\n`);

// Collect all files
function getAllFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

const allFiles = getAllFiles(EXTRACTED_DIR);
console.log(`Total files discovered in extracted_ui: ${allFiles.length}`);

const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"];
const sourceFiles = allFiles.filter(f => sourceExtensions.includes(path.extname(f)));
console.log(`Source files to audit: ${sourceFiles.length}`);

// 1. Provenance Check
console.log("\n--- Check 1: Provenance Headers ---");
const missingProvenance = [];
for (const file of sourceFiles) {
  const content = fs.readFileSync(file, "utf8");
  // Check for pingdotgg/t3code in first 1000 chars
  const header = content.slice(0, 1000);
  if (!header.includes("pingdotgg/t3code")) {
    missingProvenance.push(path.relative(EXTRACTED_DIR, file));
  }
}

if (missingProvenance.length === 0) {
  console.log(`[PASS] 100% of source files (${sourceFiles.length}/${sourceFiles.length}) contain provenance header 'pingdotgg/t3code'.`);
} else {
  console.log(`[FAIL] ${missingProvenance.length} files missing provenance:`);
  missingProvenance.forEach(f => console.log(`  - ${f}`));
}

// 2. Monorepo Leaks & External Dependencies Outside extracted_ui
console.log("\n--- Check 2: Monorepo Escape & Alias Scan ---");
const monorepoLeakRegex = /from\s+['"](@t3code|@t3tools|~\/|\.\.\/\.\.\/(?:apps|packages))/g;
const leaks = [];
for (const file of sourceFiles) {
  const content = fs.readFileSync(file, "utf8");
  let match;
  while ((match = monorepoLeakRegex.exec(content)) !== null) {
    leaks.push({ file: path.relative(EXTRACTED_DIR, file), match: match[0] });
  }
}

if (leaks.length === 0) {
  console.log("[PASS] 0 references to monorepo root (@t3code, @t3tools, ~/, ../../apps, ../../packages) found.");
} else {
  console.log(`[FAIL] Found ${leaks.length} monorepo leak imports:`);
  leaks.forEach(l => console.log(`  - ${l.file}: ${l.match}`));
}

// 3. Relative Import Resolution Check
console.log("\n--- Check 3: Relative Import Resolution ---");
const importRegex = /(?:import|export)\s+.*?from\s+['"](\.[^'"]+)['"]/g;
const brokenImports = [];

function resolveImport(sourceFilePath, importPath) {
  const dir = path.dirname(sourceFilePath);
  const targetBase = path.resolve(dir, importPath);

  // Check direct file or with extensions
  const candidates = [
    targetBase,
    `${targetBase}.ts`,
    `${targetBase}.tsx`,
    `${targetBase}.js`,
    `${targetBase}.jsx`,
    `${targetBase}.mjs`,
    `${targetBase}.json`,
    `${targetBase}.css`,
    path.join(targetBase, "index.ts"),
    path.join(targetBase, "index.tsx"),
    path.join(targetBase, "index.js"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      // Also verify that the resolved path is inside EXTRACTED_DIR
      if (!c.toLowerCase().startsWith(EXTRACTED_DIR.toLowerCase())) {
        return { ok: false, reason: "Resolved outside extracted_ui: " + c };
      }
      return { ok: true, resolved: c };
    }
  }
  return { ok: false, reason: "File not found" };
}

let totalRelativeImportsChecked = 0;
for (const file of sourceFiles) {
  if (path.extname(file) === ".css") continue;
  const content = fs.readFileSync(file, "utf8");
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    totalRelativeImportsChecked++;
    const importPath = match[1];
    const res = resolveImport(file, importPath);
    if (!res.ok) {
      brokenImports.push({
        file: path.relative(EXTRACTED_DIR, file),
        importPath,
        reason: res.reason,
      });
    }
  }
}

if (brokenImports.length === 0) {
  console.log(`[PASS] All ${totalRelativeImportsChecked} relative imports resolve successfully within extracted_ui.`);
} else {
  console.log(`[FAIL] Found ${brokenImports.length} broken imports:`);
  brokenImports.forEach(b => console.log(`  - in ${b.file}: '${b.importPath}' -> ${b.reason}`));
}

// 4. Settings Panels Inventory Check
console.log("\n--- Check 4: Settings Panels Inventory (R2) ---");
const panelsDir = path.join(EXTRACTED_DIR, "settings", "panels");
const expectedPanels = [
  "AppearanceSettingsPanel.tsx",
  "ArchivedThreadsPanel.tsx",
  "ConnectionsSettingsPanel.tsx",
  "DiagnosticsSettingsPanel.tsx",
  "GeneralSettingsPanel.tsx",
  "IntegrationsSettingsPanel.tsx",
  "KeybindingsSettingsPanel.tsx",
  "OpenSourceLicensesPanel.tsx",
  "ProjectsSettingsPanel.tsx",
  "ProvidersSettingsPanel.tsx",
  "ScheduledTasksSettingsPanel.tsx",
  "SnapShotSettingsPanel.tsx",
  "SourceControlSettingsPanel.tsx",
  "StorageSettingsPanel.tsx",
];

const existingPanels = fs.readdirSync(panelsDir).filter(f => f.endsWith(".tsx"));
console.log(`Discovered ${existingPanels.length} panel files in settings/panels:`);
let panelsOk = true;
for (const p of expectedPanels) {
  if (existingPanels.includes(p)) {
    const pPath = path.join(panelsDir, p);
    const size = fs.statSync(pPath).size;
    console.log(`  [OK] ${p} (${size} bytes)`);
  } else {
    console.log(`  [MISSING] ${p}`);
    panelsOk = false;
  }
}

// 5. Facade & Dummy Implementation Audit
console.log("\n--- Check 5: Facade & Dummy Implementation Audit ---");
const suspiciousFiles = [];
for (const file of sourceFiles) {
  if (path.extname(file) === ".css") continue;
  const content = fs.readFileSync(file, "utf8");
  // Check for NotImplementedError
  if (/NotImplementedError/i.test(content)) {
    suspiciousFiles.push({ file: path.relative(EXTRACTED_DIR, file), reason: "NotImplementedError" });
  }
  // Check for functions returning constant placeholder
  if (/function\s+\w+\s*\([^)]*\)\s*\{\s*return\s+(?:null|undefined|true|false|""|0);\s*\}/.test(content)) {
    suspiciousFiles.push({ file: path.relative(EXTRACTED_DIR, file), reason: "Trivial constant function" });
  }
}

if (suspiciousFiles.length === 0) {
  console.log("[PASS] 0 facade stubs, dummy functions, or NotImplemented errors detected.");
} else {
  console.log(`[WARN] Suspicious patterns detected in ${suspiciousFiles.length} files:`);
  suspiciousFiles.forEach(s => console.log(`  - ${s.file}: ${s.reason}`));
}

// 6. Usage UI Anatomy & Sector Verification (R3)
console.log("\n--- Check 6: Usage UI Visual Sectors & Math (R3) ---");
const usagePagePath = path.join(EXTRACTED_DIR, "usage", "components", "UsagePage.tsx");
if (fs.existsSync(usagePagePath)) {
  const usageContent = fs.readFileSync(usagePagePath, "utf8");
  console.log(`[OK] UsagePage.tsx exists (${fs.statSync(usagePagePath).size} bytes).`);
  const sectors = [
    { id: "Sector 1", desc: "Hero Total Banner", check: /totalTokens|totalCost|costUsd|totalSpent/i.test(usageContent) },
    { id: "Sector 2", desc: "Period / Filter Controls", check: /period|today|sinceDay|untilDay|resolution/i.test(usageContent) },
    { id: "Sector 3", desc: "Interactive Spline Chart Engine", check: /UsageProviderChart/.test(usageContent) },
    { id: "Sector 4", desc: "Category / Model Share Bar", check: /UsageShareBar/.test(usageContent) },
    { id: "Sector 5", desc: "Rate Limits & Quota Cards", check: /UsageLimits/.test(usageContent) },
    { id: "Sector 6", desc: "Pricing & Overrides Table", check: /UsagePriceOverrides|UsageModelDialog/.test(usageContent) },
    { id: "Sector 7", desc: "Provider Settings / Controls", check: /usageProviders|provider/i.test(usageContent) },
  ];
  for (const s of sectors) {
    console.log(`  ${s.check ? "[OK]" : "[FAIL]"} ${s.id}: ${s.desc}`);
  }
} else {
  console.log("[FAIL] UsagePage.tsx does not exist!");
}

console.log("\n=== INDEPENDENT AUDIT COMPLETE ===");
