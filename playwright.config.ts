import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "e2e",
    timeout: 60000,
    // Electron apps use a single user-data dir; run tests serially.
    workers: 1,
    reporter: [["list"]],
});
