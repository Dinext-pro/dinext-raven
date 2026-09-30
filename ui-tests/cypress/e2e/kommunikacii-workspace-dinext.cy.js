const users = () => Cypress.env("ravenUsers");

describe("Чат-workspace Dinext и Raven в Settings", () => {
	before(() => {
		const email = users().admin;
		cy.login("Administrator");
		cy.openDesk();
		cy.ensureUser({
			email,
			firstName: "Cypress Raven Admin",
			roles: ["System Manager", "Raven User"],
		});
	});

	beforeEach(() => {
		cy.login(users().admin, Cypress.env("uiPassword"));
	});

	it("показывает workspace Dinext и логотип Dinext", () => {
		cy.visit("/raven");
		cy.contains("Dinext", { timeout: 20000 }).should("be.visible");
		cy.get("img[src*='DI_SQ_NBG'], [style*='DI_SQ_NBG']", { timeout: 20000 }).should("exist");
	});

	it("оставляет Desk workspace Raven и карточку Settings Hub", () => {
		cy.openDesk("/app/raven");
		cy.get(".title-text").should("contain", "Raven");
		cy.get(".title-text").should("not.contain", "Dinext");

		cy.visit("/app/dinext-settings-hub");
		cy.contains("a.dinext-workspace-hub__card", "Raven", { timeout: 20000 })
			.should("have.attr", "href")
			.and("include", "/app/raven");
		cy.contains("a.dinext-workspace-hub__card", "Raven").find("use, svg").should("exist");
		cy.contains("a.dinext-workspace-hub__card", "Raven")
			.invoke("html")
			.should("match", /message-1/);
	});
});
