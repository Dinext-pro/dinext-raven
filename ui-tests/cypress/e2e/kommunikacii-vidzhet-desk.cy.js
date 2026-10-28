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
		cy.get(".raven-chat").should(($chat) => {
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
			win.frappe.set_route("List", "User");
		});
		cy.url().should("include", "/app/user");
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

	it("сдвигает виджет вдоль низа в свёрнутом и открытом виде", () => {
		resetWidgetLeft();
		cy.get(".raven-chat").should(($chat) => {
			const box = widgetBox($chat);
			expect(box.left).to.be.closeTo(60, 2);
			expect(box.width).to.be.closeTo((400 * 2) / 3, 2);
			expect(box.bottom).to.be.closeTo(box.viewHeight, 2);
		});
		cy.get(".raven-chat").then(($chat) => {
			const before = widgetBox($chat);
			dragWidgetHeader(140);
			cy.get('.raven-container[data-open-state="false"]').should("exist");
			cy.get(".raven-chat").should(($moved) => {
				const box = widgetBox($moved);
				expect(box.left).to.be.closeTo(before.left + 140, 4);
				expect(box.width).to.be.closeTo(before.width, 2);
				expect(box.bottom).to.be.closeTo(box.viewHeight, 2);
				expect(box.right).to.be.at.most(box.viewWidth + 1);
			});
			cy.get(".raven-header > div:not(.raven-channel-header) > .back-button").click();
			cy.get('.raven-container[data-open-state="true"]', { timeout: 20000 }).should("exist");
			cy.get(".raven-channel-list").should("be.visible");
			dragWidgetHeader(900);
			cy.get(".raven-chat").should(($moved) => {
				const box = widgetBox($moved);
				expect($moved.find(".raven-container").attr("data-open-state")).to.eq("true");
				expect(box.bottom).to.be.closeTo(box.viewHeight, 2);
				expect(box.left).to.be.at.least(0);
				expect(box.right).to.be.closeTo(box.viewWidth, 2);
			});
			cy.get(".raven-channel-list").should("be.visible");
		});
	});

	it("возвращает сдвинутый виджет после перехода и перезагрузки", () => {
		resetWidgetLeft();
		dragWidgetHeader(160);
		cy.get(".raven-chat").then(($chat) => {
			const left = widgetBox($chat).left;
			cy.window().then((win) => {
				const stored = win.localStorage.getItem(
					`dinext_raven.desk_widget_left:${win.frappe.session.user}`
				);
				expect(stored, "stored left").to.match(/^\d+$/);
				expect(Number(stored)).to.be.closeTo(left, 2);
				win.frappe.set_route("List", "User");
			});
			cy.url().should("include", "/app/user");
			cy.get(".raven-chat").should(($moved) => {
				expect(widgetBox($moved).left).to.be.closeTo(left, 2);
			});
			cy.reload();
			cy.get(".raven-chat", { timeout: 20000 }).should(($moved) => {
				const box = widgetBox($moved);
				expect(box.left).to.be.closeTo(left, 2);
				expect(box.bottom).to.be.closeTo(box.viewHeight, 2);
			});
		});
	});
});

function widgetBox($chat) {
	const rect = $chat[0].getBoundingClientRect();
	const view = $chat[0].ownerDocument.defaultView;
	return {
		left: rect.left,
		right: rect.right,
		bottom: rect.bottom,
		width: rect.width,
		viewWidth: view.innerWidth,
		viewHeight: view.innerHeight,
	};
}

function resetWidgetLeft() {
	cy.openDesk("/app");
	cy.get(".raven-chat", { timeout: 20000 }).should("be.visible");
	cy.window().then((win) => {
		win.localStorage.removeItem(`dinext_raven.desk_widget_left:${win.frappe.session.user}`);
	});
	cy.reload();
	cy.get(".raven-chat", { timeout: 20000 }).should("be.visible");
	cy.get('.raven-container[data-open-state="false"]').should("exist");
}

function dragWidgetHeader(dx) {
	cy.get(".raven-header").realMouseDown({ position: "center", scrollBehavior: false });
	cy.get(".raven-header").realMouseMove(dx, 0, {
		position: "center",
		keepMouseDownButton: "left",
		scrollBehavior: false,
	});
	cy.get(".raven-header").realMouseUp({ position: "center", scrollBehavior: false });
}
