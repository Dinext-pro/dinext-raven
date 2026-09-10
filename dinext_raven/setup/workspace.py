# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Chat workspace rename, Desk Settings nest, and Settings Hub card."""

from __future__ import annotations

import frappe
from frappe import _

from dinext_common.setup.hub_catalog import SETTINGS_HUB_SETTINGS, register_hub_items

APP_NAME = "dinext_raven"
CHAT_WORKSPACE = "Dinext"
VENDOR_CHAT_WORKSPACE = "Raven"
DESK_WORKSPACE = "Raven"
DINEXT_CHAT_LOGO = "/assets/dinext_common/images/DI_SQ_NBG.png"
TRANSLATION_CONTEXT = "Dinext.Raven"

RAVEN_HUB_ITEM = {
	"section": "Workspaces",
	"element_type": "Workspace",
	"target": DESK_WORKSPACE,
	"label": "Raven",
	"description": "Raven messaging settings, users, bots, and integrations.",
	"icon": "message-1",
}


def setup_dinext_raven() -> None:
	ensure_chat_workspace()
	nest_desk_workspace()
	register_settings_hub_card()
	from dinext_raven.document_channels.project import backfill_project_channels

	backfill_project_channels()


def ensure_chat_workspace() -> None:
	"""Rename or merge Raven Workspace Raven into Dinext. Leave Desk Workspace Raven alone."""
	if not frappe.db.exists("DocType", "Raven Workspace"):
		return

	has_vendor = frappe.db.exists("Raven Workspace", VENDOR_CHAT_WORKSPACE)
	has_dinext = frappe.db.exists("Raven Workspace", CHAT_WORKSPACE)

	if has_vendor and not has_dinext:
		frappe.rename_doc(
			"Raven Workspace",
			VENDOR_CHAT_WORKSPACE,
			CHAT_WORKSPACE,
			force=True,
		)
	elif has_vendor and has_dinext:
		_merge_chat_workspace(VENDOR_CHAT_WORKSPACE, CHAT_WORKSPACE)
		frappe.delete_doc("Raven Workspace", VENDOR_CHAT_WORKSPACE, ignore_permissions=True, force=True)

	ensure_chat_workspace_logo()


def ensure_chat_workspace_logo() -> None:
	if not frappe.db.exists("Raven Workspace", CHAT_WORKSPACE):
		return
	if frappe.db.get_value("Raven Workspace", CHAT_WORKSPACE, "logo") == DINEXT_CHAT_LOGO:
		return
	frappe.db.set_value(
		"Raven Workspace",
		CHAT_WORKSPACE,
		"logo",
		DINEXT_CHAT_LOGO,
		update_modified=False,
	)


def _merge_chat_workspace(source: str, target: str) -> None:
	for channel in frappe.get_all("Raven Channel", filters={"workspace": source}, pluck="name"):
		frappe.db.set_value("Raven Channel", channel, "workspace", target, update_modified=False)

	target_users = set(
		frappe.get_all("Raven Workspace Member", filters={"workspace": target}, pluck="user")
	)
	for member in frappe.get_all(
		"Raven Workspace Member",
		filters={"workspace": source},
		fields=["name", "user", "is_admin"],
	):
		if member.user in target_users:
			frappe.delete_doc("Raven Workspace Member", member.name, ignore_permissions=True, force=True)
			continue
		frappe.db.set_value(
			"Raven Workspace Member",
			member.name,
			"workspace",
			target,
			update_modified=False,
		)


def nest_desk_workspace() -> None:
	if "dinext_common" not in frappe.get_installed_apps():
		return
	from dinext_common.setup.workspace import configure_workspace_menu

	configure_workspace_menu()


def register_settings_hub_card() -> None:
	if "dinext_common" not in frappe.get_installed_apps():
		return
	register_hub_items(
		[RAVEN_HUB_ITEM],
		source_app=APP_NAME,
		settings_name=SETTINGS_HUB_SETTINGS,
	)


def get_chat_workspace() -> str:
	if frappe.db.exists("Raven Workspace", CHAT_WORKSPACE):
		return CHAT_WORKSPACE
	if frappe.db.exists("Raven Workspace", VENDOR_CHAT_WORKSPACE):
		return VENDOR_CHAT_WORKSPACE
	frappe.throw(_("Chat workspace Dinext is not available", context=TRANSLATION_CONTEXT))
