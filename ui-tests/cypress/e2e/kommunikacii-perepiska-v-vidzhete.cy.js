const users = () => Cypress.env("ravenUsers");
const state = {};

describe("Переписка в виджете Desk", () => {
	before(() => {
		const stamp = Date.now();
		state.text = `Cypress hello ${stamp}`;
		state.reply = `Cypress reply ${stamp}`;
		state.channel = `Cypress chat ${stamp}`;
		cy.login("Administrator");
		cy.openDesk();
		cy.ensureUser({
			email: users().member,
			firstName: "Cypress Raven Member",
			roles: ["System Manager", "Raven User"],
		});
		cy.ensureUser({
			email: users().peer,
			firstName: "Cypress Raven Peer",
			roles: ["System Manager", "Raven User"],
		});
		cy.setRavenOnDesk(true);
		cy.login(users().member, Cypress.env("uiPassword"));
		cy.openDesk();
		cy.insertTask(`Cypress chat task ${stamp}`).then((name) => {
			cy.createDocumentChannel({
				doctype: "Task",
				name,
				channelName: state.channel,
				invitees: [users().peer],
			});
		});
	});

	it("обменивается сообщениями двумя сессиями, не уходя с Desk", () => {
		cy.login(users().member, Cypress.env("uiPassword"));
		cy.openDesk("/app");
		cy.openWidgetChannel(state.channel);
		cy.url().should("include", "/app");
		cy.url().should("not.include", "/raven");
		cy.get(".raven-chat-input textarea").type(`${state.text}{enter}`);
		cy.get(".raven-tiptap-renderer", { timeout: 20000 }).should("contain", state.text);

		cy.login(users().peer, Cypress.env("uiPassword"));
		cy.openDesk("/app");
		cy.openWidgetChannel(state.channel);
		cy.get(".raven-tiptap-renderer", { timeout: 20000 }).should("contain", state.text);
		cy.get(".raven-chat-input textarea").type(`${state.reply}{enter}`);
		cy.get(".raven-tiptap-renderer", { timeout: 20000 }).should("contain", state.reply);

		cy.login(users().member, Cypress.env("uiPassword"));
		cy.openDesk("/app");
		cy.openWidgetChannel(state.channel);
		cy.get(".raven-chat-view-container").should("contain", state.text);
		cy.get(".raven-chat-view-container").should("contain", state.reply);
		cy.url().should("not.include", "/raven/");
	});
});
