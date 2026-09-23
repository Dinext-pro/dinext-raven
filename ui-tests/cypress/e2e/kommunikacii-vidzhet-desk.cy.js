const users = () => Cypress.env("ravenUsers");

function prepareMember() {
	cy.login("Administrator");
	cy.openDesk();
	cy.ensureUser({
		email: users().member,
		firstName: "Cypress Raven Member",
		roles: ["System Manager", "Raven User"],
	});
	cy.ensureUser({
		email: users().norole,
		firstName: "Cypress Raven NoRole",
		roles: ["System Manager"],
	});
	cy.setRavenOnDesk(true);
}

describe("Виджет чата на Desk", () => {
	before(() => {
		prepareMember();
		cy.login(users().member, Cypress.env("uiPassword"));
		cy.openDesk();
		cy.insertTask(`Cypress widget ${Date.now()}`).then((name) => {
			cy.createDocumentChannel({
				doctype: "Task",
				name,
				channelName: `Cypress widget channel ${Date.now()}`,
			});
		});
	});

	beforeEach(() => {
		cy.viewport(1400, 960);
		cy.login(users().member, Cypress.env("uiPassword"));
	});

	after(() => {
		cy.login("Administrator");
		cy.openDesk();
		cy.setRavenOnDesk(true);
	});

	it("держит свёрнутую полосу без лишнего scroll и раскрывает список", () => {
		cy.openDesk("/app");
		cy.get(".raven-chat", { timeout: 20000 }).should("be.visible");
		cy.get(".main-section").invoke("css", "padding-bottom").should("eq", "0px");
		cy.window().its("scrollY").should("eq", 0);
		cy.get(".raven-chat").then(($chat) => {
			const width = $chat[0].getBoundingClientRect().width;
			expect(width).to.be.within(240, 290);
		});
		cy.get(".raven-chat").invoke("css", "opacity").then(parseFloat).should("be.closeTo", 0.7, 0.05);

		cy.get(".raven-chat").realHover();
		cy.wait(300);
		cy.get(".raven-chat").invoke("css", "opacity").then(parseFloat).should("be.closeTo", 1, 0.05);

		cy.expandWidget();
		cy.get(".raven-channel-list").should("be.visible");
		cy.window().its("scrollY").should("eq", 0);
	});

	it("сохраняет виджет после перехода по Desk", () => {
		cy.openDesk("/app");
		cy.get(".raven-chat", { timeout: 20000 }).should("exist");
		cy.window().then((win) => {
			win.frappe.set_route("List", "ToDo");
		});
		cy.url().should("include", "/app/todo");
		cy.get(".page-container:visible").should("have.length", 1);
		cy.get(".raven-chat").should("be.visible");
		cy.window().its("scrollY").should("eq", 0);
	});

	it("остаётся читаемым в светлой и тёмной теме без перезагрузки", () => {
		cy.openDesk("/app");
		cy.get(".raven-chat", { timeout: 20000 }).should("be.visible");
		cy.expandWidget();
		cy.get(".raven-channel-list").should("be.visible");
		cy.switchDeskTheme("dark");
		cy.get(".raven-channel-list").should("be.visible");
		cy.switchDeskTheme("light");
		cy.get(".raven-channel-list").should("be.visible");
	});

	it("не монтирует виджет без роли Raven User", () => {
		cy.login(users().norole, Cypress.env("uiPassword"));
		cy.openDesk("/app");
		cy.window().its("frappe.boot").should("exist");
		cy.wait(1500);
		cy.get(".raven-chat").should("not.exist");
	});

	it("не монтирует виджет, когда чат на Desk выключен", () => {
		cy.login("Administrator");
		cy.openDesk();
		cy.setRavenOnDesk(false);
		cy.login(users().member, Cypress.env("uiPassword"));
		cy.openDesk("/app");
		cy.window().its("frappe.boot").should("exist");
		cy.wait(1500);
		cy.get(".raven-chat").should("not.exist");
		cy.login("Administrator");
		cy.openDesk();
		cy.setRavenOnDesk(true);
	});

	it("не монтирует виджет на узком viewport", () => {
		cy.viewport(375, 700);
		cy.openDesk("/app");
		cy.window().its("frappe.boot").should("exist");
		cy.wait(1500);
		cy.get(".raven-chat").should("not.exist");
	});
});
