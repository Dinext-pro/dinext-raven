import "cypress-real-events/support";
import "./commands";

before(() => {
	const adminPassword = Cypress.env("adminPassword");
	if (!adminPassword) {
		throw new Error("CYPRESS_ADMIN_PASSWORD is required");
	}
	Cypress.env("uiPassword", `${adminPassword}-ui`);
});
