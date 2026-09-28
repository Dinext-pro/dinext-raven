const { defineConfig } = require("cypress");

const baseUrl = process.env.CYPRESS_BASE_URL;
if (!baseUrl) {
	throw new Error("CYPRESS_BASE_URL is required");
}

module.exports = defineConfig({
	defaultCommandTimeout: 20000,
	pageLoadTimeout: 60000,
	viewportWidth: 1400,
	viewportHeight: 960,
	video: false,
	e2e: {
		baseUrl,
		specPattern: "cypress/e2e/**/*.cy.js",
		supportFile: "cypress/support/e2e.js",
	},
});
