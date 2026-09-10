# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

from __future__ import annotations

import json

import frappe
from frappe import _

from dinext_raven.document_channels.service import (
	TRANSLATION_CONTEXT,
	create_linked_channel,
	get_assignees,
	get_linked_channels,
	get_share_users,
	get_synced_channel,
	is_denied_doctype,
	user_has_document_relationship,
)
from dinext_raven.setup.workspace import CHAT_WORKSPACE


def _parse_list(value) -> list[str]:
	if not value:
		return []
	if isinstance(value, str):
		stripped = value.strip()
		if stripped.startswith("["):
			value = json.loads(stripped)
		else:
			value = [part.strip() for part in stripped.split(",") if part.strip()]
	if not isinstance(value, list):
		return []
	return [str(item) for item in value if item]


def _assert_can_discuss(doctype: str, name: str) -> None:
	if is_denied_doctype(doctype):
		frappe.throw(_("This document type cannot have a Raven channel", context=TRANSLATION_CONTEXT))
	if not name or frappe.db.exists(doctype, name) is None:
		frappe.throw(_("Document not found", context=TRANSLATION_CONTEXT))
	if "Raven User" not in frappe.get_roles() and frappe.session.user != "Administrator":
		frappe.throw(_("You need the Raven User role to discuss this document", context=TRANSLATION_CONTEXT))
	if not frappe.has_permission(doctype, "read", doc=name):
		frappe.throw(_("Not permitted", context=TRANSLATION_CONTEXT))


@frappe.whitelist()
def get_accessible_project_channel(project: str) -> dict | None:
	"""Return the synced Project channel when the caller can read it."""
	if not project or not frappe.db.exists("DocType", "Project"):
		return None
	if not frappe.db.exists("Project", project):
		return None
	if "Raven User" not in frappe.get_roles() and frappe.session.user != "Administrator":
		return None
	if not frappe.has_permission("Project", "read", doc=project):
		return None
	channel_name = get_synced_channel("Project", project)
	if not channel_name:
		return None
	values = frappe.db.get_value(
		"Raven Channel",
		channel_name,
		["name", "channel_name", "workspace", "is_archived"],
		as_dict=True,
	)
	if not values or values.is_archived:
		return None
	if not frappe.has_permission("Raven Channel", "read", doc=channel_name):
		return None
	if not frappe.db.exists(
		"Raven Channel Member",
		{"channel_id": values.name, "user_id": frappe.session.user},
	):
		return None
	return {
		"name": values.name,
		"channel_name": values.channel_name,
		"workspace": values.workspace,
	}


@frappe.whitelist()
def get_document_channels(doctype: str, name: str) -> list[dict]:
	_assert_can_discuss(doctype, name)
	channels = get_linked_channels(doctype, name)
	workspace = CHAT_WORKSPACE
	for channel in channels:
		channel["route"] = f"/raven/{channel.workspace or workspace}/{channel.name}"
	return channels


@frappe.whitelist()
def get_invite_candidates(doctype: str, name: str) -> list[dict]:
	_assert_can_discuss(doctype, name)
	users = set(get_assignees(doctype, name)) | set(get_share_users(doctype, name))
	for user in frappe.get_all("User", filters={"enabled": 1, "user_type": "System User"}, pluck="name"):
		if user in {"Guest", "Administrator"}:
			continue
		if user_has_document_relationship(doctype, name, user):
			users.add(user)
	rows = []
	for user in sorted(users):
		full_name = frappe.db.get_value("User", user, "full_name") or user
		rows.append({"name": user, "full_name": full_name})
	return rows


@frappe.whitelist(methods=["POST"])
def create_document_channel(
	doctype: str,
	name: str,
	channel_name: str | None = None,
	channel_type: str = "Private",
	invitees=None,
) -> dict:
	_assert_can_discuss(doctype, name)
	invite_list = _parse_list(invitees)
	members = get_assignees(doctype, name) + get_share_users(doctype, name) + [frappe.session.user]
	channel = create_linked_channel(
		doctype,
		name,
		channel_name=channel_name,
		channel_type=channel_type or "Private",
		is_synced=0,
		members=members,
		invitees=invite_list,
	)
	return {"name": channel, "route": f"/raven/{CHAT_WORKSPACE}/{channel}"}
