const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
  },
  projects: [
    {
      name: "Pixel 9",
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        viewport: { width: 412, height: 915 },
      },
    },
    {
      name: "iPhone SE 3",
      use: {
        ...devices["iPhone SE"],
        browserName: "chromium",
      },
    },
  ],
  webServer: {
    command: "python -m http.server 4173 --directory public",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: true,
  },
});
