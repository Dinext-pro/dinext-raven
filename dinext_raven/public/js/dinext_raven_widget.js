frappe.provide("dinext_raven");

dinext_raven._main_section_observer = null;
dinext_raven._page_height_observer = null;
dinext_raven._body_height_observer = null;
dinext_raven._router_bound = false;
dinext_raven.WIDGET_STYLE_ID = "dinext-raven-widget-scroll-fix";
dinext_raven.SCROLL_SLACK_PX = 12;

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

dinext_raven.fix_desk_widget = function () {
	dinext_raven.inject_widget_styles();
	dinext_raven.clear_main_section_padding();
	const chat = document.querySelector(".raven-chat");
	if (chat && chat.parentElement !== document.body) {
		document.body.appendChild(chat);
	}
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
