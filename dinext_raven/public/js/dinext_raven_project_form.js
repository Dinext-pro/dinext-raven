frappe.provide("dinext_raven");

const DINEXT_RAVEN_PROJECT_CTX = "Dinext.Raven";

dinext_raven.remove_project_channel_icon = function (frm) {
	if (frm && frm.page && frm.page.icon_group) {
		frm.page.icon_group.find(".dinext-raven-project-channel").remove();
	}
};

dinext_raven.render_project_channel_icon = function (frm) {
	dinext_raven.remove_project_channel_icon(frm);
	if (!frm || frm.is_new() || !frm.doc || !frm.doc.name || !frm.page) {
		return;
	}
	const project = frm.doc.name;
	frappe.call({
		method: "dinext_raven.document_channels.api.get_accessible_project_channel",
		args: { project: project },
		callback: function (r) {
			const channel = r.message;
			dinext_raven.remove_project_channel_icon(frm);
			if (!frm.doc || frm.doc.name !== project || !channel || !channel.name) {
				return;
			}
			const btn = frm.page.add_action_icon(
				"message-1",
				function () {
					dinext_raven.open_channel(channel);
				},
				"dinext-raven-project-channel",
				__("Open project channel", null, DINEXT_RAVEN_PROJECT_CTX)
			);
			const print_icon = frm.toolbar && frm.toolbar.print_icon;
			if (print_icon && print_icon.length) {
				btn.insertBefore(print_icon);
			}
		},
	});
};

frappe.ui.form.on("Project", {
	refresh: function (frm) {
		frappe.require(["/assets/dinext_raven/css/dinext_raven_project_form.css"], function () {
			dinext_raven.render_project_channel_icon(frm);
		});
	},
});
