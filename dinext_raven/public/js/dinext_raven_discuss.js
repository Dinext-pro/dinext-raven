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

dinext_raven.has_raven_role = function () {
	const roles = (frappe.boot && frappe.boot.user && frappe.boot.user.roles) || [];
	return roles.includes("Raven User") || frappe.session.user === "Administrator";
};

dinext_raven.is_denied_doctype = function (doctype) {
	return !!(dinext_raven.DISCUSS_DENYLIST[doctype] || String(doctype || "").startsWith("Raven "));
};

dinext_raven.can_discuss_document = function (doctype, name) {
	if (!doctype || !name) {
		return false;
	}
	if (!dinext_raven.has_raven_role()) {
		return false;
	}
	if (dinext_raven.is_denied_doctype(doctype)) {
		return false;
	}
	return true;
};

dinext_raven.can_discuss = function (frm) {
	if (!frm || frm.is_new() || !frm.doc || !frm.doc.name) {
		return false;
	}
	return dinext_raven.can_discuss_document(frm.doctype, frm.doc.name);
};

dinext_raven.document_context = function (source) {
	if (!source) {
		return null;
	}
	const doctype = source.doctype;
	const docname = source.docname || (source.doc && source.doc.name) || source.name;
	if (!doctype || !docname) {
		return null;
	}
	const doc = source.doc || { name: docname };
	const meta = source.meta || (frappe.get_meta && frappe.get_meta(doctype)) || {};
	return { doctype: doctype, docname: docname, doc: doc, meta: meta };
};

dinext_raven.WIDGET_OPEN_TIMEOUT_MS = 8000;
dinext_raven.WIDGET_CHAT_VIEW_WAIT_MS = 1000;
dinext_raven.WIDGET_CHAT_VIEW_SETTLE_MS = 400;
dinext_raven.DEFAULT_CHAT_WORKSPACE = "Dinext";
dinext_raven._open_channel_generation = 0;

dinext_raven.widget_container = function () {
	return document.querySelector(".raven-container");
};

dinext_raven.widget_is_available = function () {
	return !!(dinext_raven.widget_container() || (window.frappe && frappe.raven_chat));
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

dinext_raven.channel_route = function (channel) {
	if (channel && channel.route) {
		return channel.route;
	}
	const name = channel && channel.name;
	if (!name) {
		return "";
	}
	const workspace = (channel && channel.workspace) || dinext_raven.DEFAULT_CHAT_WORKSPACE;
	return "/raven/" + workspace + "/" + name;
};

dinext_raven.open_channel_in_new_window = function (channel) {
	const route = dinext_raven.channel_route(channel);
	if (!route || typeof window.open !== "function") {
		frappe.show_alert({
			message: __("Could not open the channel in the Raven widget", null, DINEXT_RAVEN_CTX),
			indicator: "orange",
		});
		return false;
	}
	const opened = window.open(route, "_blank", "noopener,noreferrer");
	if (!opened) {
		frappe.show_alert({
			message: __("Could not open the channel", null, DINEXT_RAVEN_CTX),
			indicator: "orange",
		});
		return false;
	}
	return true;
};

dinext_raven.open_channel = function (channel) {
	if (!channel || !channel.name) {
		return;
	}
	if (!dinext_raven.widget_is_available()) {
		dinext_raven.open_channel_in_new_window(channel);
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

dinext_raven.open_created_channel = function (channel) {
	return dinext_raven
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
	const hidden =
		frm && frm.footer && frm.footer.frm && frm.wrapper
			? $(frm.wrapper).find(".send-raven-button").get(0)
			: null;
	if (hidden) {
		hidden.click();
		return;
	}
	const ctx = dinext_raven.document_context(frm);
	if (ctx) {
		dinext_raven.show_send_raven_dialog(ctx);
		return;
	}
	frappe.msgprint({
		title: __("Send to chat or channel", null, DINEXT_RAVEN_CTX),
		message: __("The Raven send dialog is not available on this form.", null, DINEXT_RAVEN_CTX),
		indicator: "orange",
	});
};

dinext_raven.show_create_channel_dialog = function (source, on_created) {
	const ctx = dinext_raven.document_context(source);
	if (!ctx) {
		return;
	}
	frappe.call({
		method: "dinext_raven.document_channels.api.get_invite_candidates",
		args: { doctype: ctx.doctype, name: ctx.docname },
		callback: function (r) {
			const candidates = (r.message || []).map((row) => row.name);
			const title_field = ctx.meta && ctx.meta.title_field;
			const dialog = new frappe.ui.Dialog({
				title: __("Create channel", null, DINEXT_RAVEN_CTX),
				fields: [
					{
						fieldname: "channel_name",
						label: __("Channel Name", null, DINEXT_RAVEN_CTX),
						fieldtype: "Data",
						default: (title_field && ctx.doc[title_field]) || ctx.docname,
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
							doctype: ctx.doctype,
							name: ctx.docname,
							channel_name: values.channel_name,
							channel_type: values.channel_type || "Private",
							invitees: values.invitees || [],
						},
						freeze: true,
						callback: function (created) {
							dialog.hide();
							frappe.show_alert({
								message: __("Channel created", null, DINEXT_RAVEN_CTX),
								indicator: "green",
							});
							if (on_created) {
								on_created(created.message);
							}
						},
					});
				},
			});
			dialog.show();
		},
	});
};

dinext_raven.send_document_raven = function (opts) {
	const message = (opts && opts.message) || "";
	const insert_message = function (file_url) {
		const ext = file_url ? String(file_url).split(".").pop() : "";
		const is_image = /jpe?g|png|gif/i.test(ext);
		return frappe.db.insert({
			doctype: "Raven Message",
			channel_id: opts.channel,
			text: message,
			json: {
				content: [
					{
						content: [{ text: message, type: "text" }],
						type: "paragraph",
					},
				],
				type: "doc",
			},
			message_type: file_url ? (is_image ? "Image" : "File") : "Text",
			file: file_url || "",
			link_doctype: opts.doctype,
			link_document: opts.docname,
		});
	};
	const done = function () {
		frappe.show_alert({
			message: __("Message sent", null, DINEXT_RAVEN_CTX),
			indicator: "green",
		});
		if (frappe.utils && frappe.utils.play_sound) {
			frappe.utils.play_sound("email");
		}
	};
	const fail = function () {
		frappe.throw(__("Error sending message", null, DINEXT_RAVEN_CTX));
	};
	if (opts.file_name) {
		frappe.db
			.get_value("File", { name: opts.file_name }, "file_url")
			.then(function (res) {
				return insert_message(res && res.message && res.message.file_url);
			})
			.then(done)
			.catch(fail);
		return;
	}
	insert_message("").then(done).catch(fail);
};

dinext_raven.show_send_raven_dialog = function (source) {
	const ctx = dinext_raven.document_context(source);
	if (!ctx) {
		frappe.msgprint({
			title: __("Send to chat or channel", null, DINEXT_RAVEN_CTX),
			message: __("The Raven send dialog is not available on this form.", null, DINEXT_RAVEN_CTX),
			indicator: "orange",
		});
		return;
	}
	frappe.call({
		method: "raven.api.raven_channel.get_channels",
		args: { hide_archived: true },
		callback: function (r) {
			const channels = (r && r.message) || [];
			if (!channels.length) {
				frappe.msgprint({
					title: __("Send a Raven", null, DINEXT_RAVEN_CTX),
					indicator: "blue",
					message: __("No channels found", null, DINEXT_RAVEN_CTX),
				});
				return;
			}
			const dm_list = [];
			const channel_list = [];
			const channel_id = [];
			channels.forEach(function (channel) {
				if (channel.is_direct_message) {
					dm_list.push(channel.full_name);
					channel_id.push({ value: channel.name, name: channel.full_name });
				} else {
					channel_list.push(channel.channel_name);
					channel_id.push({ value: channel.name, name: channel.channel_name });
				}
			});
			let attachments = [];
			const dialog = new frappe.ui.Dialog({
				title: __("Send a Raven", null, DINEXT_RAVEN_CTX),
				fields: [
					{
						fieldname: "type",
						label: __("Type", null, DINEXT_RAVEN_CTX),
						fieldtype: "Select",
						options: ["DM", "Channel"],
						default: "Channel",
						onchange: function () {
							const field = dialog.get_field("channel");
							field.df.options = this.value === "DM" ? dm_list : channel_list;
							field.refresh();
						},
					},
					{
						fieldname: "channel",
						label: __("Channel/DM", null, DINEXT_RAVEN_CTX),
						fieldtype: "Select",
						options: channel_list,
						reqd: 1,
					},
					{
						fieldname: "message",
						label: __("Message", null, DINEXT_RAVEN_CTX),
						fieldtype: "Long Text",
					},
					{ fieldtype: "Section Break" },
					{
						label: __("Select Attachments", null, DINEXT_RAVEN_CTX),
						fieldtype: "HTML",
						fieldname: "select_attachments",
					},
				],
				primary_action_label: __("Send", null, DINEXT_RAVEN_CTX),
				primary_action(values) {
					const selected = channel_id.find((row) => row.name === values.channel);
					if (!selected) {
						frappe.throw(__("Error sending message", null, DINEXT_RAVEN_CTX));
						return;
					}
					const checked =
						$(dialog.wrapper).find("[data-file-name]:checked").attr("data-file-name") || "";
					dinext_raven.send_document_raven({
						channel: selected.value,
						message: values.message || "",
						file_name: checked,
						doctype: ctx.doctype,
						docname: ctx.docname,
					});
					dialog.hide();
				},
				secondary_action_label: __("Discard", null, DINEXT_RAVEN_CTX),
				secondary_action() {
					dialog.hide();
				},
			});
			const render_rows = function () {
				const list = $(dialog.fields_dict.select_attachments.wrapper).find(".attach-list");
				list.empty();
				attachments.forEach(function (file) {
					if (!file.file_name) {
						return;
					}
					list.append(`
						<p class="flex">
							<label class="attachment-radio">
								<input type="radio" name="attachmentRadioGroup" data-file-name="${frappe.utils.escape_html(
									file.name
								)}">
								<span class="ellipsis">${frappe.utils.escape_html(file.file_name)}</span>
							</label>
						</p>
					`);
				});
			};
			frappe.call({
				method: "frappe.desk.form.load.get_docinfo",
				args: { doctype: ctx.doctype, name: ctx.docname },
				callback: function (info) {
					const docinfo = info.docinfo || info.message || {};
					attachments = Array.isArray(docinfo.attachments) ? docinfo.attachments.slice() : [];
					const attach = $(dialog.fields_dict.select_attachments.wrapper);
					attach.html(`
						<label class="control-label">${__("Select Attachments", null, DINEXT_RAVEN_CTX)}</label>
						<div class="attach-list"></div>
						<p class="add-more-attachments">
							<button type="button" class="btn btn-xs btn-default">${__(
								"Add Attachment",
								null,
								DINEXT_RAVEN_CTX
							)}</button>
						</p>
					`);
					attach.find(".add-more-attachments button").on("click", function () {
						new frappe.ui.FileUploader({
							doctype: ctx.doctype,
							docname: ctx.docname,
							folder: "Home/Attachments",
							on_success: function (attachment) {
								attachments.push(attachment);
								render_rows();
							},
						});
					});
					render_rows();
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
						dinext_raven.open_created_channel(channel);
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
