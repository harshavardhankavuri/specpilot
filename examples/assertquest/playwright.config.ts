import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const env = process.env.APITEST_ENV ?? "dev";
dotenv.config({ path: path.join("environments", `${env}.env`) });

// The one generic spec file lives in the apitest-framework package, not this project.
const specFile = fileURLToPath(import.meta.resolve("apitest-framework/runtime/scenario.spec.ts"));

export default defineConfig({
  testDir: path.dirname(specFile),
  testMatch: "scenario.spec.ts",
  fullyParallel: true,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
    ["allure-playwright", { resultsDir: "allure-results", detail: true, suiteTitle: false }],
  ],
  use: {
    trace: "retain-on-failure",
  },
});
