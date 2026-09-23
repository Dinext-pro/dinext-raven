const users = () => Cypress.env("ravenUsers");
const state = {};

function teamFieldExists() {
	return cy
		.call("frappe.client.get_list", {
			doctype: "Custom Field",
			filters: { dt: "Project", fieldname: "custom_ts_details" },
			fields: ["name"],
			limit_page_length: 1,
		})
		.then((rows) => Boolean(rows && rows.length));
}

describe("Канал проекта и иконка на форме", () => {
	before(function () {
		cy.login("Administrator");
		cy.openDesk();
		teamFieldExists().then(function (exists) {
			if (!exists) {
				this.skip();
				return;
			}
			cy.ensureUser({
				email: users().member,
				firstName: "Cypress Raven Member",
				roles: ["System Manager", "Raven User"],
			});
			cy.ensureUser({
				email: users().outsider,
				firstName: "Cypress Raven Outsider",
				roles: ["System Manager", "Raven User"],
			});
			cy.setRavenOnDesk(true);
			cy.call("frappe.client.get_list", {
				doctype: "Project Role",
				fields: ["name"],
				limit_page_length: 1,
			}).then((rows) => {
				if (rows && rows.length) {
					state.role = rows[0].name;
					return null;
				}
				return cy.call("frappe.client.insert", {
					doc: {
						doctype: "Project Role",
						role_name: `Cypress Raven Role ${Date.now()}`,
						enabled: 1,
					},
				});
			}).then((doc) => {
				if (doc && doc.name) {
					state.role = doc.name;
				}
				const stamp = Date.now();
				state.projectName = `Cypress Raven Project ${stamp}`;
				return cy.call("frappe.client.insert", {
					doc: {
						doctype: "Project",
						project_name: state.projectName,
						custom_ts_details: [
							{
								pt_role: state.role,
								pt_participant: users().member,
								pt_valid_from: "2020-01-01",
								pt_valid_for: "2099-01-01",
								virtual_worker: 0,
							},
						],
					},
				});
			}).then((doc) => {
				state.project = doc.name;
			});
		});
	});

	it("открывает synced-канал с иконки перед печатью", () => {
		cy.login(users().member, Cypress.env("uiPassword"));
		cy.openDesk(`/app/project/${state.project}`);
		cy.get(".dinext-raven-project-channel", { timeout: 20000 })
			.should("have.attr", "title", "Открыть канал проекта")
			.then(($button) => {
				const next = $button.next(".icon-btn");
				expect(next.attr("title") || "").to.match(/Print|Печать/);
			});
		cy.get(".dinext-raven-project-channel").click();
		cy.get(".raven-chat-view-container", { timeout: 20000 }).should("be.visible");
		cy.get(".raven-channel-header-name").should("contain", state.projectName);
		cy.url().should("include", "/app/project/");
	});

	it("на узкой ширине оставляет только иконку канала", () => {
		cy.login(users().member, Cypress.env("uiPassword"));
		cy.viewport(700, 900);
		cy.openDesk(`/app/project/${state.project}`);
		cy.get(".dinext-raven-project-channel", { timeout: 20000 }).should("be.visible");
		cy.get(".page-icon-group > .icon-btn:not(.dinext-raven-project-channel)").should("not.be.visible");
	});

	it("не показывает иконку чужому пользователю и на новом проекте", () => {
		cy.login(users().outsider, Cypress.env("uiPassword"));
		cy.openDesk(`/app/project/${state.project}`);
		cy.get(".page-head", { timeout: 20000 }).should("be.visible");
		cy.wait(1500);
		cy.get(".dinext-raven-project-channel").should("not.exist");

		cy.login(users().member, Cypress.env("uiPassword"));
		cy.openDesk("/app/project/new");
		cy.get(".page-head", { timeout: 20000 }).should("be.visible");
		cy.wait(1000);
		cy.get(".dinext-raven-project-channel").should("not.exist");
	});
});
