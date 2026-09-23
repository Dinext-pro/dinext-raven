const users = () => Cypress.env("ravenUsers");
const state = {};

function openDiscuss(label) {
	cy.contains(".dinext-raven-timeline-controls button", "Обсудить").click();
	cy.contains(".dinext-raven-timeline-controls .dropdown-item", label).click();
}

describe("Обсуждение документа", () => {
	before(() => {
		const stamp = Date.now();
		state.createdName = `Cypress created ${stamp}`;
		state.sent = `Cypress sent ${stamp}`;
		cy.login("Administrator");
		cy.openDesk();
		cy.ensureUser({
			email: users().member,
			firstName: "Cypress Raven Member",
			roles: ["System Manager", "Raven User"],
		});
		cy.setRavenOnDesk(true);
		cy.login(users().member, Cypress.env("uiPassword"));
		cy.openDesk();
		cy.insertTask(`Cypress discuss zero ${stamp}`).then((name) => {
			state.zero = name;
			return cy.call("frappe.client.insert", {
				doc: {
					doctype: "Comment",
					comment_type: "Comment",
					reference_doctype: "Task",
					reference_name: name,
					content: "cypress",
				},
			});
		}).then((doc) => {
			state.comment = doc.name;
		});
		cy.insertTask(`Cypress discuss one ${stamp}`).then((name) => {
			state.one = name;
			cy.createDocumentChannel({
				doctype: "Task",
				name,
				channelName: `Cypress one ${stamp}`,
			}).then((channel) => {
				state.oneChannel = channel.channel_name;
			});
		});
		cy.insertTask(`Cypress discuss many ${stamp}`).then((name) => {
			state.many = name;
			cy.createDocumentChannel({
				doctype: "Task",
				name,
				channelName: `Cypress many a ${stamp}`,
			});
			cy.createDocumentChannel({
				doctype: "Task",
				name,
				channelName: `Cypress many b ${stamp}`,
			});
		});
		cy.call("frappe.client.insert", {
			doc: {
				doctype: "File",
				file_name: `cypress-raven-${stamp}.txt`,
				content: "cypress",
				is_private: 1,
			},
		}).then((doc) => {
			state.file = doc.name;
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

	it("показывает только Обсудить, когда каналов нет", () => {
		cy.openDesk(`/app/task/${state.zero}`);
		cy.get(".dinext-raven-timeline-controls", { timeout: 20000 }).should("be.visible");
		cy.contains(".dinext-raven-timeline-controls button", "Обсудить").should("be.visible");
		cy.get(".dinext-raven-open-channel").should("not.exist");
		cy.contains(".dinext-raven-timeline-controls button", "Каналы").should("not.exist");
		cy.get("body").then(($body) => {
			const button = $body.find(".send-raven-button");
			if (button.length) {
				expect(button).not.to.be.visible;
			}
		});
	});

	it("открывает единственный канал из иконки", () => {
		cy.openDesk(`/app/task/${state.one}`);
		cy.get(".dinext-raven-open-channel", { timeout: 20000 }).should("be.visible");
		cy.contains(".dinext-raven-timeline-controls button", "Обсудить").should("be.visible");
		cy.get(".dinext-raven-open-channel").click();
		cy.get(".raven-chat-view-container", { timeout: 20000 }).should("be.visible");
		cy.get(".raven-channel-header-name").should("contain", state.oneChannel);
	});

	it("показывает меню Каналы, если каналов несколько", () => {
		cy.openDesk(`/app/task/${state.many}`);
		cy.contains(".dinext-raven-timeline-controls button", "Каналы", { timeout: 20000 }).should(
			"be.visible"
		);
		cy.get(".dinext-raven-open-channel").should("not.exist");
		cy.contains(".dinext-raven-timeline-controls button", "Каналы").click();
		cy.get(".dinext-raven-timeline-controls .dropdown-item").should("have.length.at.least", 2);
	});

	it("отправляет сообщение в канал с русской подписью диалога", () => {
		cy.openDesk(`/app/task/${state.one}`);
		cy.get(".dinext-raven-timeline-controls", { timeout: 20000 }).should("be.visible");
		openDiscuss("Отправить в чат/канал");
		cy.get(".modal-title").should("contain", "Отправить Raven");
		cy.get(".modal [data-fieldname='message'] textarea").type(state.sent);
		cy.get(".modal .btn-primary").contains("Отправить").click();
		cy.contains("Сообщение отправлено", { timeout: 20000 }).should("be.visible");
		cy.openWidgetChannel(state.oneChannel);
		cy.get(".raven-chat-view-container").should("contain", state.sent);
	});

	it("создаёт канал и открывает его в виджете", () => {
		cy.openDesk(`/app/task/${state.zero}`);
		cy.get(".dinext-raven-timeline-controls", { timeout: 20000 }).should("be.visible");
		openDiscuss("Создать канал");
		cy.get(".modal-title").should("contain", "Создать канал");
		cy.get(".modal [data-fieldname='channel_name'] input").clear().type(state.createdName);
		cy.get(".modal .btn-primary").contains("Создать").click();
		cy.contains("Канал создан", { timeout: 20000 }).should("be.visible");
		cy.get(".raven-chat-view-container", { timeout: 20000 }).should("be.visible");
		cy.get(".raven-channel-header-name").should("contain", state.createdName);
		cy.get(".dinext-raven-open-channel", { timeout: 20000 }).should("exist");
	});

	it("не показывает Discuss на новом документе и в denylist, показывает на File", () => {
		cy.openDesk("/app/task/new");
		cy.get(".page-head", { timeout: 20000 }).should("be.visible");
		cy.wait(1000);
		cy.get(".dinext-raven-timeline-controls").should("not.exist");

		cy.visit(`/app/comment/${state.comment}`);
		cy.get(".page-head", { timeout: 20000 }).should("be.visible");
		cy.wait(1000);
		cy.get(".dinext-raven-timeline-controls").should("not.exist");

		cy.visit(`/app/file/${state.file}`);
		cy.get(".dinext-raven-timeline-controls", { timeout: 20000 }).should("exist");
	});

	it("без виджета открывает маршрут канала", () => {
		cy.login("Administrator");
		cy.openDesk();
		cy.setRavenOnDesk(false);
		cy.login(users().member, Cypress.env("uiPassword"));
		cy.openDesk(`/app/task/${state.one}`);
		cy.window().then((win) => {
			cy.stub(win, "open").as("channelTab");
		});
		cy.get(".dinext-raven-open-channel", { timeout: 20000 }).click();
		cy.get("@channelTab").should("be.called");
		cy.get("@channelTab").its("lastCall.args.0").should("match", /\/raven\/Dinext\//);
		cy.login("Administrator");
		cy.openDesk();
		cy.setRavenOnDesk(true);
	});
});
