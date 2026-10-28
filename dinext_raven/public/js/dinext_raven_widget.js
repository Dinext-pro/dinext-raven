frappe.provide("dinext_raven");

dinext_raven._main_section_observer = null;
dinext_raven._page_height_observer = null;
dinext_raven._body_height_observer = null;
dinext_raven._router_bound = false;
dinext_raven.WIDGET_STYLE_ID = "dinext-raven-widget-scroll-fix";
dinext_raven.SCROLL_SLACK_PX = 12;
dinext_raven.DEFAULT_WIDGET_LEFT = 60;
dinext_raven.DRAG_THRESHOLD_PX = 6;
dinext_raven.WIDGET_LEFT_KEY_PREFIX = "dinext_raven.desk_widget_left:";
dinext_raven._drag = null;
dinext_raven._suppress_click = false;
dinext_raven._drag_bound = false;
dinext_raven._window_resize_bound = false;
dinext_raven._widget_resize_observer = null;
dinext_raven._observed_chat = null;

dinext_raven.widget_left_key = function () {
	const user = window.frappe && frappe.session && frappe.session.user;
	return dinext_raven.WIDGET_LEFT_KEY_PREFIX + (user || "Guest");
};

dinext_raven.read_widget_left = function () {
	try {
		if (!window.localStorage) {
			return dinext_raven.DEFAULT_WIDGET_LEFT;
		}
		const raw = localStorage.getItem(dinext_raven.widget_left_key());
		if (raw == null || raw === "") {
			return dinext_raven.DEFAULT_WIDGET_LEFT;
		}
		const left = Number(raw);
		return Number.isFinite(left) ? left : dinext_raven.DEFAULT_WIDGET_LEFT;
	} catch (e) {
		return dinext_raven.DEFAULT_WIDGET_LEFT;
	}
};

dinext_raven.write_widget_left = function (left) {
	try {
		if (window.localStorage) {
			localStorage.setItem(dinext_raven.widget_left_key(), String(Math.round(left)));
		}
	} catch (e) {
		// Storage can be unavailable in private mode.
	}
};

dinext_raven.widget_max_left = function (chat) {
	const width = chat.getBoundingClientRect().width;
	return Math.max(0, window.innerWidth - width);
};

dinext_raven.clamp_widget_left = function (left, chat) {
	return Math.min(Math.max(0, left), dinext_raven.widget_max_left(chat));
};

dinext_raven.apply_widget_left = function (chat) {
	chat = chat || document.querySelector(".raven-chat");
	if (!chat || dinext_raven._drag) {
		return;
	}
	const left = Math.round(dinext_raven.clamp_widget_left(dinext_raven.read_widget_left(), chat));
	chat.style.left = left + "px";
	chat.style.bottom = "0px";
};

dinext_raven.observe_widget_size = function () {
	if (!window.ResizeObserver) {
		return;
	}
	const chat = document.querySelector(".raven-chat");
	if (!chat || dinext_raven._observed_chat === chat) {
		return;
	}
	if (dinext_raven._widget_resize_observer) {
		dinext_raven._widget_resize_observer.disconnect();
	}
	dinext_raven._observed_chat = chat;
	dinext_raven._widget_resize_observer = new ResizeObserver(function () {
		dinext_raven.apply_widget_left(chat);
	});
	dinext_raven._widget_resize_observer.observe(chat);
};

dinext_raven.bind_window_resize = function () {
	if (dinext_raven._window_resize_bound) {
		return;
	}
	dinext_raven._window_resize_bound = true;
	window.addEventListener("resize", function () {
		dinext_raven.apply_widget_left();
	});
};

dinext_raven.finish_widget_drag = function (event) {
	const drag = dinext_raven._drag;
	if (!drag || (event && event.pointerId !== drag.pointerId)) {
		return;
	}
	dinext_raven._drag = null;
	drag.chat.classList.remove("dinext-raven-dragging");
	if (drag.header.releasePointerCapture && drag.header.hasPointerCapture) {
		try {
			if (drag.header.hasPointerCapture(drag.pointerId)) {
				drag.header.releasePointerCapture(drag.pointerId);
			}
		} catch (e) {
			// Capture may already be gone.
		}
	}
	if (!drag.moved) {
		return;
	}
	const left = Math.round(dinext_raven.clamp_widget_left(drag.chat.getBoundingClientRect().left, drag.chat));
	drag.chat.style.left = left + "px";
	drag.chat.style.bottom = "0px";
	dinext_raven.write_widget_left(left);
	dinext_raven._suppress_click = true;
	setTimeout(function () {
		dinext_raven._suppress_click = false;
	}, 0);
};

dinext_raven.bind_widget_drag = function () {
	if (dinext_raven._drag_bound) {
		return;
	}
	dinext_raven._drag_bound = true;

	document.addEventListener(
		"pointerdown",
		function (event) {
			if (dinext_raven._drag) {
				return;
			}
			if (event.pointerType === "mouse" && event.button !== 0) {
				return;
			}
			const target = event.target;
			if (!target || !target.closest) {
				return;
			}
			const header = target.closest(".raven-header");
			const chat = header && header.closest(".raven-chat");
			if (!header || !chat) {
				return;
			}
			dinext_raven._drag = {
				pointerId: event.pointerId,
				startX: event.clientX,
				originLeft: chat.getBoundingClientRect().left,
				chat: chat,
				header: header,
				moved: false,
			};
		},
		true
	);

	document.addEventListener(
		"pointermove",
		function (event) {
			const drag = dinext_raven._drag;
			if (!drag || event.pointerId !== drag.pointerId) {
				return;
			}
			const dx = event.clientX - drag.startX;
			if (!drag.moved) {
				if (Math.abs(dx) < dinext_raven.DRAG_THRESHOLD_PX) {
					return;
				}
				drag.moved = true;
				drag.chat.classList.add("dinext-raven-dragging");
				if (drag.header.setPointerCapture) {
					try {
						drag.header.setPointerCapture(event.pointerId);
					} catch (e) {
						// Capture can fail if the pointer already ended.
					}
				}
			}
			event.preventDefault();
			const left = Math.round(dinext_raven.clamp_widget_left(drag.originLeft + dx, drag.chat));
			drag.chat.style.left = left + "px";
			drag.chat.style.bottom = "0px";
		},
		{ capture: true, passive: false }
	);

	document.addEventListener("pointerup", dinext_raven.finish_widget_drag, true);
	document.addEventListener("pointercancel", dinext_raven.finish_widget_drag, true);
	document.addEventListener(
		"click",
		function (event) {
			if (!dinext_raven._suppress_click) {
				return;
			}
			dinext_raven._suppress_click = false;
			event.preventDefault();
			event.stopPropagation();
		},
		true
	);
};

dinext_raven.inject_widget_styles = function () {
	if (document.getElementById(dinext_raven.WIDGET_STYLE_ID)) {
		return;
	}
	const style = document.createElement("style");
	style.id = dinext_raven.WIDGET_STYLE_ID;
	style.textContent = [
		".main-section { padding-bottom: 0 !important; }",
		".raven-chat { position: fixed !important; bottom: 0; left: 60px; margin: 0; max-height: calc(100dvh - 48px); }",
		".raven-chat:has(.raven-container[data-open-state=\"false\"]) { box-sizing: border-box; overflow: hidden !important; }",
		"html.dinext-raven-no-page-scroll { overflow-y: hidden !important; }",
	].join("\n");
	document.head.appendChild(style);
};

dinext_raven.clear_main_section_padding = function () {
	document.querySelectorAll(".main-section").forEach(function (main) {
		if (main.style) {
			main.style.removeProperty("padding-bottom");
		}
	});
};

dinext_raven.observe_main_section = function () {
	if (!window.MutationObserver) {
		return;
	}
	const main = document.querySelector(".main-section");
	if (!main) {
		return;
	}
	if (dinext_raven._main_section_observer) {
		dinext_raven._main_section_observer.disconnect();
	}
	dinext_raven._main_section_observer = new MutationObserver(function () {
		dinext_raven.fix_desk_widget();
	});
	dinext_raven._main_section_observer.observe(main, {
		attributes: true,
		attributeFilter: ["style"],
	});
};

dinext_raven.mount_desk_widget = function () {
	if (dinext_raven._desk_widget_mounted || document.querySelector(".raven-chat")) {
		return;
	}
	if (!(window.frappe && frappe.boot && frappe.boot.show_raven_chat_on_desk)) {
		return;
	}
	if (!frappe.user || !frappe.user.has_role("Raven User")) {
		return;
	}
	if (frappe.is_mobile && frappe.is_mobile()) {
		return;
	}
	const main = document.querySelector(".main-section");
	if (!main) {
		return;
	}
	dinext_raven._desk_widget_mounted = true;
	const chat_element = document.createElement("div");
	chat_element.className = "raven-chat";
	main.appendChild(chat_element);
	frappe.require("raven_chat.bundle.jsx").then(function () {
		if (frappe.raven_chat || !(frappe.ui && frappe.ui.RavenChat)) {
			return;
		}
		frappe.raven_chat = new frappe.ui.RavenChat({
			wrapper: $(chat_element),
		});
	});
};

dinext_raven.fix_desk_widget = function () {
	dinext_raven.mount_desk_widget();
	dinext_raven.inject_widget_styles();
	dinext_raven.clear_main_section_padding();
	const chat = document.querySelector(".raven-chat");
	if (chat && chat.parentElement !== document.body) {
		document.body.appendChild(chat);
	}
	dinext_raven.bind_widget_drag();
	dinext_raven.bind_window_resize();
	dinext_raven.apply_widget_left(chat);
	dinext_raven.observe_widget_size();
};

dinext_raven.reset_desk_scroll = function () {
	window.scrollTo(0, 0);
	if (document.documentElement) {
		document.documentElement.scrollTop = 0;
	}
	if (document.body) {
		document.body.scrollTop = 0;
	}
};

dinext_raven.visible_page = function () {
	const current = window.cur_page && cur_page.page;
	if (current && document.contains(current)) {
		const style = window.getComputedStyle(current);
		if (style.display !== "none" && style.visibility !== "hidden") {
			return current;
		}
	}
	return (
		[...document.querySelectorAll(".page-container")].find(function (el) {
			const style = window.getComputedStyle(el);
			return style.display !== "none" && style.visibility !== "hidden";
		}) || null
	);
};

dinext_raven.hide_stale_pages = function () {
	const current = (window.cur_page && cur_page.page) || dinext_raven.visible_page();
	document.querySelectorAll(".page-container").forEach(function (el) {
		if (el !== current) {
			el.style.display = "none";
		}
	});
};

dinext_raven.visible_page_needs_scroll = function () {
	const page = dinext_raven.visible_page();
	if (!page) {
		return false;
	}
	const slack = dinext_raven.SCROLL_SLACK_PX;
	const rect = page.getBoundingClientRect();
	const height = Math.max(page.scrollHeight, rect.height);
	return height > window.innerHeight + slack;
};

dinext_raven.sync_document_overflow = function (opts) {
	opts = opts || {};
	if (opts.reset !== false) {
		dinext_raven.reset_desk_scroll();
	}
	const lock_scroll = !dinext_raven.visible_page_needs_scroll();
	if (document.documentElement.classList.contains("dinext-raven-no-page-scroll") === lock_scroll) {
		return;
	}
	document.documentElement.classList.toggle("dinext-raven-no-page-scroll", lock_scroll);
};

dinext_raven.observe_page_height = function () {
	if (!window.ResizeObserver) {
		return;
	}
	if (dinext_raven._page_height_observer) {
		dinext_raven._page_height_observer.disconnect();
	}
	const page = dinext_raven.visible_page();
	if (!page) {
		return;
	}
	dinext_raven._page_height_observer = new ResizeObserver(function () {
		dinext_raven.sync_document_overflow({ reset: false });
	});
	dinext_raven._page_height_observer.observe(page);
};

dinext_raven.observe_body_height = function () {
	if (!window.ResizeObserver) {
		return;
	}
	const body = document.getElementById("body") || document.body;
	if (!body) {
		return;
	}
	if (dinext_raven._body_height_observer) {
		dinext_raven._body_height_observer.disconnect();
	}
	dinext_raven._body_height_observer = new ResizeObserver(function () {
		dinext_raven.sync_document_overflow({ reset: false });
	});
	dinext_raven._body_height_observer.observe(body);
};

dinext_raven.on_desk_page_change = function () {
	dinext_raven.fix_desk_widget();
	dinext_raven.hide_stale_pages();
	dinext_raven.observe_main_section();
	dinext_raven.observe_page_height();
	dinext_raven.observe_body_height();
	dinext_raven.reset_desk_scroll();
	requestAnimationFrame(function () {
		dinext_raven.sync_document_overflow();
		setTimeout(dinext_raven.sync_document_overflow, 50);
		setTimeout(dinext_raven.sync_document_overflow, 200);
		setTimeout(dinext_raven.sync_document_overflow, 500);
		setTimeout(dinext_raven.sync_document_overflow, 800);
		setTimeout(dinext_raven.sync_document_overflow, 1200);
	});
};

dinext_raven.bind_router_change = function () {
	if (dinext_raven._router_bound || !(window.frappe && frappe.router && frappe.router.on)) {
		return;
	}
	dinext_raven._router_bound = true;
	frappe.router.on("change", function () {
		dinext_raven.on_desk_page_change();
	});
};

$(document).on("app_ready", function () {
	dinext_raven.fix_desk_widget();
	dinext_raven.observe_main_section();
	dinext_raven.observe_page_height();
	dinext_raven.observe_body_height();
	dinext_raven.bind_router_change();
	let attempts = 0;
	const timer = setInterval(function () {
		dinext_raven.fix_desk_widget();
		attempts += 1;
		if (document.querySelector(".raven-chat") || attempts > 24) {
			clearInterval(timer);
			dinext_raven.sync_document_overflow();
		}
	}, 250);
});

$(document).on("page-change", function () {
	dinext_raven.on_desk_page_change();
});
