const USERS = {
	admin: "cypress.raven.admin@example.com",
	member: "cypress.raven.member@example.com",
	peer: "cypress.raven.peer@example.com",
	outsider: "cypress.raven.outsider@example.com",
	norole: "cypress.raven.norole@example.com",
};

Cypress.env("ravenUsers", USERS);

Cypress.Commands.add("login", (email, password) => {
	const user = email || "Administrator";
	const secret = password || Cypress.env("adminPassword");
	if (!secret) {
		throw new Error("CYPRESS_ADMIN_PASSWORD is required");
	}
	cy.session([user, secret], () => {
		cy.request({
			method: "POST",
			url: "/api/method/login",
			body: { usr: user, pwd: secret },
		});
	});
});

Cypress.Commands.add("call", (method, args = {}) => {
	return cy
		.window()
		.its("frappe.csrf_token")
		.then((csrfToken) => {
			return cy
				.request({
					method: "POST",
					url: `/api/method/${method}`,
					body: args,
					headers: {
						Accept: "application/json",
						"Content-Type": "application/json",
						"X-Frappe-CSRF-Token": csrfToken,
					},
				})
				.then((response) => response.body.message);
		});
});

Cypress.Commands.add("ensureUser", ({ email, firstName, roles }) => {
	const password = Cypress.env("uiPassword");
	cy.call("frappe.client.get_list", {
		doctype: "User",
		filters: { name: email },
		fields: ["name"],
		limit_page_length: 1,
	}).then((rows) => {
		if (!rows || !rows.length) {
			return cy.call("frappe.client.insert", {
				doc: {
					doctype: "User",
					email,
					first_name: firstName,
					send_welcome_email: 0,
					user_type: "System User",
					new_password: password,
					language: "ru",
					roles: roles.map((role) => ({ role })),
				},
			});
		}
		return cy.call("frappe.client.get", { doctype: "User", name: email }).then((user) => {
			const have = new Set((user.roles || []).map((row) => row.role));
			roles.forEach((role) => {
				if (!have.has(role)) {
					user.roles.push({ role });
				}
			});
			user.language = "ru";
			user.new_password = password;
			user.send_welcome_email = 0;
			user.enabled = 1;
			return cy.call("frappe.client.save", { doc: user });
		});
	});
});

Cypress.Commands.add("openDesk", (path = "/app") => {
	cy.visit(path);
	cy.window().its("frappe.csrf_token").should("be.a", "string");
});

Cypress.Commands.add("expandWidget", () => {
	cy.get(".raven-container", { timeout: 20000 }).should("exist");
	cy.get(".raven-container").then(($root) => {
		if ($root.find(".raven-channel-header").length) {
			cy.get(".raven-channel-header > .back-button").click();
		}
		if ($root.attr("data-open-state") !== "true") {
			cy.get(".raven-header > div:not(.raven-channel-header) > .back-button").click();
		}
	});
	cy.get('.raven-container[data-open-state="true"]', { timeout: 20000 }).should("exist");
});

Cypress.Commands.add("openWidgetChannel", (channelName) => {
	cy.expandWidget();
	cy.contains(".raven-channel-list-item__name", channelName, { timeout: 20000 }).click();
	cy.get(".raven-chat-view-container", { timeout: 20000 }).should("be.visible");
	cy.get(".raven-channel-header-name").should("contain", channelName);
});

Cypress.Commands.add("switchDeskTheme", (mode) => {
	cy.window().then((win) => {
		expect(win.Mousetrap, "desk shortcut handler").to.exist;
		win.Mousetrap.trigger("shift+ctrl+g");
	});
	cy.get(".theme-grid", { timeout: 20000 }).should("be.visible");
	cy.get(`.theme-grid [data-theme="${mode}"]`).first().click({ force: true });
	cy.document().its("documentElement").should("have.attr", "data-theme-mode", mode);
	cy.window().then((win) => {
		if (win.frappe.theme_switcher) {
			win.frappe.theme_switcher.hide();
		}
	});
	cy.get(".raven-chat").should("be.visible");
});

Cypress.Commands.add("setRavenOnDesk", (enabled) => {
	cy.call("frappe.client.set_value", {
		doctype: "Raven Settings",
		name: "Raven Settings",
		fieldname: "show_raven_on_desk",
		value: enabled ? 1 : 0,
	});
});

Cypress.Commands.add("insertTask", (subject) => {
	return cy
		.call("frappe.client.insert", {
			doc: {
				doctype: "Task",
				subject,
			},
		})
		.then((doc) => doc.name);
});

Cypress.Commands.add("createDocumentChannel", ({ doctype, name, channelName, invitees }) => {
	return cy.call("dinext_raven.document_channels.api.create_document_channel", {
		doctype,
		name,
		channel_name: channelName,
		channel_type: "Private",
		invitees: invitees || [],
	});
});
