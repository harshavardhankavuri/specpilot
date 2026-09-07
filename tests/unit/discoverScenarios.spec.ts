import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverScenarios } from "../../src/interpreter/discoverScenarios.js";

let dir: string;

afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe("discoverScenarios", () => {
  it("reads and validates .scenario.yaml and .cases.yaml files", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "apitest-scenarios-"));
    fs.writeFileSync(
      path.join(dir, "flow.scenario.yaml"),
      "name: flow\nsteps:\n  - operation: createBooking\n    body: {}\n"
    );
    fs.writeFileSync(
      path.join(dir, "flow.cases.yaml"),
      "name: flow\ncases:\n  - name: unauthorized\n    steps:\n      - operation: createBooking\n        assert:\n          - status: 401\n"
    );
    const scenarios = discoverScenarios(dir);
    expect(scenarios).toHaveLength(2);
    expect(scenarios.find((s) => s.steps)).toBeDefined();
    expect(scenarios.find((s) => s.cases)).toBeDefined();
  });

  it("throws a file-and-field-named error on invalid scenario data", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "apitest-scenarios-"));
    fs.writeFileSync(path.join(dir, "bad.scenario.yaml"), "name: bad\nsteps: []\n");
    expect(() => discoverScenarios(dir)).toThrow(/bad\.scenario\.yaml/);
  });

  it("returns an empty array when the scenarios directory doesn't exist", () => {
    expect(discoverScenarios(path.join(os.tmpdir(), "nonexistent-" + Date.now()))).toEqual([]);
  });
});
