frappe.provide("dinext_raven");

const DINEXT_RAVEN_CTX = "Dinext.Raven";

dinext_raven.DISCUSS_DENYLIST = {
	DocShare: true,
	Version: true,
	"Activity Log": true,
	"Error Log": true,
	"Route History": true,
	Communication: true,
	"Email Queue": true,
	Comment: true,
	"View Log": true,
	"Access Log": true,
};

dinext_raven.can_discuss = function (frm) {
	if (!frm || frm.is_new() || !frm.doc || !frm.doc.name) {
		return false;
	}
	if (!frappe.boot.user.roles.includes("Raven User") && frappe.session.user !== "Administrator") {
		return false;
	}
	if (dinext_raven.DISCUSS_DENYLIST[frm.doctype] || String(frm.doctype).startsWith("Raven ")) {
		return false;
	}
	return true;
};

dinext_raven.WIDGET_OPEN_TIMEOUT_MS = 8000;
dinext_raven.WIDGET_CHAT_VIEW_WAIT_MS = 1000;
dinext_raven.WIDGET_CHAT_VIEW_SETTLE_MS = 400;
dinext_raven._open_channel_generation = 0;

dinext_raven.widget_container = function () {
	return document.querySelector(".raven-container");
};

dinext_raven.widget_content = function () {
	const root = dinext_raven.widget_container();
	return root ? root.querySelector(".raven-content-container") : null;
};

dinext_raven.widget_toggle_button = function (root) {
	return root
		? root.querySelector(".raven-header > div:not(.raven-channel-header) > .back-button")
		: null;
};

dinext_raven.widget_channel_back_button = function (root) {
	return root ? root.querySelector(".raven-channel-header > .back-button") : null;
};

dinext_raven.widget_has_chat_view = function (root) {
	return !!(root && root.querySelector(".raven-chat-view-container"));
};

dinext_raven.current_widget_channel = function () {
	const content = dinext_raven.widget_content();
	return (content && content.getAttribute("data-channel")) || "";
};

dinext_raven.find_channel_list_item = function (root, channel) {
	if (!root || !channel) {
		return null;
	}
	const items = root.querySelectorAll(".raven-channel-list-item");
	let match = null;
	items.forEach(function (item) {
		const label = item.querySelector(".raven-channel-list-item__name");
		const text = label ? label.textContent.trim() : "";
		if (text && (text === channel.channel_name || text === channel.name)) {
			match = item;
		}
	});
	return match;
};

dinext_raven.next_widget_open_action = function (state) {
	const current = (state && state.current) || "";
	const targetName = (state && state.targetName) || "";
	if (!(state && state.open)) {
		return "expand";
	}
	if (targetName && current === targetName) {
		if (state.hasChatView) {
			return "done";
		}
		if (state.canRetry) {
			return "back";
		}
		return "wait";
	}
	if (state && state.hasMatch) {
		return "select";
	}
	if (current) {
		return "back";
	}
	return "wait";
};

dinext_raven.refresh_widget_channel_list = function () {
	const chat = window.frappe && frappe.raven_chat;
	if (!chat || !chat.$raven_chat || !chat.setup_app) {
		return false;
	}
	try {
		chat.$raven_chat.unmount();
	} catch (err) {
		return false;
	}
	chat.setup_app();
	return true;
};

dinext_raven.wait_ms = function (ms) {
	return new Promise(function (resolve) {
		setTimeout(resolve, ms);
	});
};

dinext_raven.wait_for_modals_to_close = function () {
	return new Promise(function (resolve) {
		const deadline = Date.now() + dinext_raven.WIDGET_OPEN_TIMEOUT_MS;
		const step = function () {
			if (!document.querySelector(".modal.show") || Date.now() > deadline) {
				resolve();
				return;
			}
			setTimeout(step, 100);
		};
		step();
	});
};

dinext_raven.leave_open_widget_channel = function () {
	return new Promise(function (resolve) {
		const deadline = Date.now() + dinext_raven.WIDGET_OPEN_TIMEOUT_MS;
		let cleared_at = null;
		const step = function () {
			if (!dinext_raven.current_widget_channel()) {
				if (cleared_at == null) {
					cleared_at = Date.now();
				}
				if (Date.now() - cleared_at >= dinext_raven.WIDGET_CHAT_VIEW_SETTLE_MS) {
					resolve();
					return;
				}
			} else if (Date.now() > deadline) {
				resolve();
				return;
			} else {
				const back = dinext_raven.widget_channel_back_button(dinext_raven.widget_container());
				if (back) {
					back.click();
				}
			}
			setTimeout(step, 100);
		};
		step();
	});
};

dinext_raven.open_channel = function (channel) {
	if (!channel || !channel.name) {
		return;
	}
	if (!dinext_raven.widget_container() && !(window.frappe && frappe.raven_chat)) {
		frappe.show_alert({
			message: __("Raven widget is not available", null, DINEXT_RAVEN_CTX),
			indicator: "orange",
		});
		return;
	}
	dinext_raven.open_channel_in_widget(channel).catch(function (err) {
		if (err && err.message === "cancelled") {
			return;
		}
		frappe.show_alert({
			message: __("Could not open the channel in the Raven widget", null, DINEXT_RAVEN_CTX),
			indicator: "orange",
		});
	});
};

dinext_raven.open_channel_in_widget = function (channel) {
	const generation = (dinext_raven._open_channel_generation += 1);
	return new Promise(function (resolve, reject) {
		const deadline = Date.now() + dinext_raven.WIDGET_OPEN_TIMEOUT_MS;
		let last_select_current = null;
		let retried_select = false;
		let matched_without_view_since = null;
		let last_back_at = 0;
		const step = function () {
			if (generation !== dinext_raven._open_channel_generation) {
				reject(new Error("cancelled"));
				return;
			}
			const root = dinext_raven.widget_container();
			if (!root) {
				if (Date.now() > deadline) {
					reject(new Error("missing widget"));
					return;
				}
				setTimeout(step, 100);
				return;
			}
			if (Date.now() > deadline) {
				reject(new Error("timeout"));
				return;
			}
			const current = dinext_raven.current_widget_channel();
			const hasChatView = dinext_raven.widget_has_chat_view(root);
			if (current === channel.name && !hasChatView) {
				if (matched_without_view_since == null) {
					matched_without_view_since = Date.now();
				}
			} else {
				matched_without_view_since = null;
			}
			const waited_for_view =
				matched_without_view_since != null &&
				Date.now() - matched_without_view_since >= dinext_raven.WIDGET_CHAT_VIEW_WAIT_MS;
			const match = dinext_raven.find_channel_list_item(root, channel);
			const action = dinext_raven.next_widget_open_action({
				open: root.getAttribute("data-open-state") === "true",
				current: current,
				targetName: channel.name,
				hasMatch: !!match,
				hasChatView: hasChatView,
				canRetry: !retried_select && waited_for_view,
			});
			if (action === "done") {
				resolve();
				return;
			}
			if (action === "expand") {
				const toggle = dinext_raven.widget_toggle_button(root);
				if (toggle) {
					toggle.click();
				}
			} else if (action === "select" && match && last_select_current !== current) {
				if (Date.now() - last_back_at < dinext_raven.WIDGET_CHAT_VIEW_SETTLE_MS) {
					setTimeout(step, 100);
					return;
				}
				match.click();
				last_select_current = current;
			} else if (action === "back") {
				const back = dinext_raven.widget_channel_back_button(root);
				if (back) {
					back.click();
				}
				last_back_at = Date.now();
				if (current === channel.name) {
					retried_select = true;
					last_select_current = null;
				}
			}
			setTimeout(step, 100);
		};
		step();
	});
};

dinext_raven.trigger_send_raven = function (frm) {
	const hidden = frm.footer && frm.footer.frm && $(frm.wrapper).find(".send-raven-button").get(0);
	if (hidden) {
		hidden.click();
		return;
	}
	frappe.msgprint({
		title: __("Send to chat or channel", null, DINEXT_RAVEN_CTX),
		message: __("The Raven send dialog is not available on this form.", null, DINEXT_RAVEN_CTX),
		indicator: "orange",
	});
};

dinext_raven.show_create_channel_dialog = function (frm, on_created) {
	frappe.call({
		method: "dinext_raven.document_channels.api.get_invite_candidates",
		args: { doctype: frm.doctype, name: frm.docname },
		callback: function (r) {
			const candidates = (r.message || []).map((row) => row.name);
			const dialog = new frappe.ui.Dialog({
				title: __("Create channel", null, DINEXT_RAVEN_CTX),
				fields: [
					{
						fieldname: "channel_name",
						label: __("Channel Name", null, DINEXT_RAVEN_CTX),
						fieldtype: "Data",
						default: frm.doc[frm.meta.title_field] || frm.docname,
						reqd: 1,
					},
					{
						fieldname: "channel_type",
						label: __("Type", null, DINEXT_RAVEN_CTX),
						fieldtype: "Select",
						options: "Private\nPublic\nOpen",
						default: "Private",
						reqd: 1,
					},
					{
						fieldname: "invitees",
						label: __("Invite participants", null, DINEXT_RAVEN_CTX),
						fieldtype: "MultiSelectPills",
						get_data: function (txt) {
							const query = (txt || "").toLowerCase();
							return candidates
								.filter((name) => name.toLowerCase().includes(query))
								.map((name) => ({ value: name, description: name }));
						},
					},
				],
				primary_action_label: __("Create", null, DINEXT_RAVEN_CTX),
				primary_action(values) {
					frappe.call({
						method: "dinext_raven.document_channels.api.create_document_channel",
						args: {
							doctype: frm.doctype,
							name: frm.docname,
							channel_name: values.channel_name,
							channel_type: values.channel_type || "Private",
							invitees: values.invitees || [],
						},
						freeze: true,
						callback: function (r) {
							dialog.hide();
							frappe.show_alert({
								message: __("Channel created", null, DINEXT_RAVEN_CTX),
								indicator: "green",
							});
							if (on_created) {
								on_created(r.message);
							}
						},
					});
				},
			});
			dialog.show();
		},
	});
};

dinext_raven.make_group_button = function (label) {
	return $(`
		<div class="inner-group-button" data-label="${encodeURIComponent(label)}">
			<button type="button" class="btn btn-xs btn-default ellipsis" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
				${frappe.utils.escape_html(label)}
				${frappe.utils.icon("select", "xs")}
			</button>
			<div role="menu" class="dropdown-menu"></div>
		</div>
	`);
};

dinext_raven.add_group_button_item = function ($group, label, handler) {
	const item = $(
		`<a class="dropdown-item" href="#" onclick="return false;" data-label="${encodeURIComponent(
			label
		)}">${frappe.utils.escape_html(label)}</a>`
	);
	item.on("click", function () {
		handler();
	});
	$group.find(".dropdown-menu").append(item);
	return item;
};

dinext_raven.init_group_button = function ($group) {
	const button = $group.find("[data-toggle='dropdown']");
	if (button.length && button.dropdown) {
		button.dropdown({ boundary: "viewport" });
	}
};

dinext_raven.render_discuss = function (frm) {
	if (!dinext_raven.can_discuss(frm) || !frm.footer || !frm.footer.frm || !frm.footer.frm.timeline) {
		return;
	}
	const actions = $(frm.wrapper).find(".timeline-actions .action-buttons");
	if (!actions.length) {
		return;
	}
	$(frm.wrapper).find(".send-raven-button").addClass("hidden").hide();
	actions.find(".dinext-raven-timeline-controls").remove();

	frappe.call({
		method: "dinext_raven.document_channels.api.get_document_channels",
		args: { doctype: frm.doctype, name: frm.docname },
		callback: function (r) {
			const channels = r.message || [];
			const wrap = $('<span class="dinext-raven-timeline-controls"></span>');

			if (channels.length === 1) {
				const open_btn = $(
					`<button type="button" class="btn btn-xs btn-default dinext-raven-open-channel" title="${frappe.utils.escape_html(
						channels[0].channel_name
					)}">${frappe.utils.icon("small-message", "xs")}</button>`
				);
				open_btn.on("click", function () {
					dinext_raven.open_channel(channels[0]);
				});
				wrap.append(open_btn);
			} else if (channels.length > 1) {
				const channels_menu = dinext_raven.make_group_button(
					__("Channels", null, DINEXT_RAVEN_CTX)
				);
				channels.forEach((channel) => {
					dinext_raven.add_group_button_item(channels_menu, channel.channel_name, function () {
						dinext_raven.open_channel(channel);
					});
				});
				wrap.append(channels_menu);
			}

			const discuss = dinext_raven.make_group_button(__("Discuss", null, DINEXT_RAVEN_CTX));
			dinext_raven.add_group_button_item(
				discuss,
				__("Send to chat or channel", null, DINEXT_RAVEN_CTX),
				function () {
					dinext_raven.trigger_send_raven(frm);
				}
			);
			dinext_raven.add_group_button_item(
				discuss,
				__("Create channel", null, DINEXT_RAVEN_CTX),
				function () {
					dinext_raven.show_create_channel_dialog(frm, function (channel) {
						dinext_raven.render_discuss(frm);
						dinext_raven
							.wait_for_modals_to_close()
							.then(function () {
								return dinext_raven.leave_open_widget_channel();
							})
							.then(function () {
								dinext_raven.refresh_widget_channel_list();
								return dinext_raven.wait_ms(dinext_raven.WIDGET_CHAT_VIEW_SETTLE_MS);
							})
							.then(function () {
								dinext_raven.open_channel(channel);
							});
					});
				}
			);
			wrap.append(discuss);
			actions.prepend(wrap);
			wrap.find(".inner-group-button").each(function () {
				dinext_raven.init_group_button($(this));
			});
		},
	});
};

$(document).on("app_ready", function () {
	(frappe.boot.user.can_read || []).forEach(function (doctype) {
		frappe.ui.form.on(doctype, {
			refresh: function (frm) {
				setTimeout(function () {
					dinext_raven.render_discuss(frm);
				}, 0);
			},
		});
	});
});
