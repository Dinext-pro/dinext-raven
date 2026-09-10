# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Linked Raven channels, membership, Raven User grant, and DocShare policy."""

from __future__ import annotations

import json

import frappe
from frappe import _
from frappe.utils import getdate, now_datetime

from dinext_raven.setup.workspace import CHAT_WORKSPACE, get_chat_workspace

TRANSLATION_CONTEXT = "Dinext.Raven"
RAVEN_USER_ROLE = "Raven User"

DENYLIST_DOCTYPES = frozenset(
	{
		"DocShare",
		"Version",
		"Activity Log",
		"Error Log",
		"Route History",
		"Communication",
		"Email Queue",
		"Comment",
		"View Log",
		"Access Log",
		"Raven Channel",
		"Raven Channel Member",
		"Raven Message",
		"Raven Workspace",
		"Raven Workspace Member",
		"Raven User",
		"Raven Message Reaction",
		"Raven Poll",
		"Raven Bot",
	}
)


def is_denied_doctype(doctype: str) -> bool:
	if not doctype:
		return True
	if doctype in DENYLIST_DOCTYPES:
		return True
	if doctype.startswith("Raven "):
		return True
	meta = frappe.get_meta(doctype)
	return bool(meta.istable)


def slugify_channel_name(title: str) -> str:
	channel_name = ""
	prev = ""
	for char in title or "":
		if char not in {" ", "-"}:
			channel_name += char
			prev = char
		elif prev != "-":
			channel_name += "-"
			prev = "-"
	channel_name = channel_name.strip("-").lower().replace(" ", "-")
	return channel_name or "channel"


def unique_channel_name(title: str, workspace: str) -> str:
	base = slugify_channel_name(title)
	candidate = base
	index = 2
	while frappe.db.exists("Raven Channel", {"channel_name": candidate, "workspace": workspace}):
		candidate = f"{base}-{index}"
		index += 1
	return candidate


def warn_user(message: str) -> None:
	if getattr(frappe.local, "request", None):
		frappe.msgprint(message, indicator="orange", alert=True)
	else:
		frappe.logger("dinext_raven").warning(message)


def user_has_role_profile(user: str) -> bool:
	values = frappe.db.get_value("User", user, ["role_profile_name"], as_dict=True)
	if values and values.role_profile_name:
		return True
	if frappe.db.exists("DocType", "User Role Profile"):
		return bool(frappe.get_all("User Role Profile", filters={"parent": user}, limit=1))
	return False


def ensure_raven_user(user: str) -> str | None:
	"""Grant Raven User + Raven User doc. Skip Role Profile users with a warning."""
	if not user or user in {"Guest", "Administrator"}:
		if user == "Administrator":
			if not frappe.db.exists("Raven User", {"user": user}):
				user_doc = frappe.get_cached_doc("User", user)
				frappe.get_doc(
					{
						"doctype": "Raven User",
						"type": "User",
						"user": user,
						"full_name": user_doc.full_name or user_doc.first_name or user,
						"first_name": user_doc.first_name or user,
						"enabled": 1,
					}
				).insert(ignore_permissions=True)
			return user
		return None

	if not frappe.db.exists("User", user):
		return None

	if frappe.db.exists("Raven User", {"user": user}):
		return user

	if user_has_role_profile(user):
		warn_user(
			_(
				"Could not add {0} to Raven because the user has a Role Profile.",
				context=TRANSLATION_CONTEXT,
			).format(user)
		)
		return None

	user_doc = frappe.get_doc("User", user)
	roles = {row.role for row in user_doc.roles}
	if RAVEN_USER_ROLE not in roles:
		user_doc.append("roles", {"role": RAVEN_USER_ROLE})
		user_doc.save(ignore_permissions=True)

	if not frappe.db.exists("Raven User", {"user": user}):
		frappe.get_doc(
			{
				"doctype": "Raven User",
				"type": "User",
				"user": user,
				"full_name": user_doc.full_name or user_doc.first_name or user,
				"first_name": user_doc.first_name or user,
				"enabled": user_doc.enabled,
			}
		).insert(ignore_permissions=True)
	return user


def ensure_workspace_member(user: str, workspace: str | None = None) -> None:
	workspace = workspace or get_chat_workspace()
	raven_user = ensure_raven_user(user)
	if not raven_user:
		return
	if frappe.db.exists("Raven Workspace Member", {"workspace": workspace, "user": raven_user}):
		return
	frappe.get_doc(
		{
			"doctype": "Raven Workspace Member",
			"workspace": workspace,
			"user": raven_user,
			"is_admin": 0,
		}
	).insert(ignore_permissions=True)


def add_channel_member(channel: str, user: str, is_admin: int = 0) -> None:
	raven_user = ensure_raven_user(user)
	if not raven_user:
		return
	ensure_workspace_member(raven_user)
	if frappe.db.exists("Raven Channel Member", {"channel_id": channel, "user_id": raven_user}):
		return
	frappe.get_doc(
		{
			"doctype": "Raven Channel Member",
			"channel_id": channel,
			"user_id": raven_user,
			"is_admin": is_admin,
			"last_visit": now_datetime(),
		}
	).insert(ignore_permissions=True)


def remove_channel_member(channel: str, user: str) -> None:
	name = frappe.db.get_value(
		"Raven Channel Member",
		{"channel_id": channel, "user_id": user},
		"name",
	)
	if name:
		frappe.delete_doc("Raven Channel Member", name, ignore_permissions=True, force=True)


def get_assignees(doctype: str, name: str) -> list[str]:
	users: list[str] = []
	assign = frappe.db.get_value(doctype, name, "_assign")
	if assign:
		try:
			users.extend(json.loads(assign) or [])
		except (TypeError, ValueError):
			pass
	for row in frappe.get_all(
		"ToDo",
		filters={
			"reference_type": doctype,
			"reference_name": name,
			"status": "Open",
		},
		pluck="allocated_to",
	):
		if row:
			users.append(row)
	return list(dict.fromkeys(users))


def get_share_users(doctype: str, name: str) -> list[str]:
	return list(
		dict.fromkeys(
			frappe.get_all(
				"DocShare",
				filters={"share_doctype": doctype, "share_name": name, "user": ["!=", ""]},
				pluck="user",
			)
		)
	)


def user_can_read_document(doctype: str, name: str, user: str) -> bool:
	try:
		return bool(frappe.has_permission(doctype, "read", doc=name, user=user))
	except Exception:
		return False


def user_has_document_relationship(doctype: str, name: str, user: str) -> bool:
	if user_can_read_document(doctype, name, user):
		return True
	if user in get_assignees(doctype, name):
		return True
	if user in get_share_users(doctype, name):
		return True
	return False


def grant_read_share_if_needed(doctype: str, name: str, user: str) -> None:
	if not user or user_can_read_document(doctype, name, user):
		return
	if not user_has_document_relationship(doctype, name, user):
		return
	if frappe.db.exists("DocShare", {"share_doctype": doctype, "share_name": name, "user": user}):
		return
	frappe.share.add(doctype, name, user, read=1)


def get_linked_channels(doctype: str, name: str) -> list[dict]:
	return frappe.get_all(
		"Raven Channel",
		filters={
			"linked_doctype": doctype,
			"linked_document": name,
			"is_direct_message": 0,
		},
		fields=["name", "channel_name", "is_synced", "is_archived", "type", "workspace"],
		order_by="is_synced desc, creation asc",
	)


def get_synced_channel(doctype: str, name: str) -> str | None:
	return frappe.db.get_value(
		"Raven Channel",
		{
			"linked_doctype": doctype,
			"linked_document": name,
			"is_synced": 1,
			"is_direct_message": 0,
		},
		"name",
	)


def document_title(doctype: str, name: str) -> str:
	meta = frappe.get_meta(doctype)
	title_field = meta.get_title_field()
	if title_field and title_field != "name":
		title = frappe.db.get_value(doctype, name, title_field)
		if title:
			return str(title)
	return str(name)


def create_linked_channel(
	doctype: str,
	name: str,
	*,
	channel_name: str | None = None,
	channel_type: str = "Private",
	is_synced: int = 0,
	members: list[str] | None = None,
	invitees: list[str] | None = None,
) -> str:
	if is_denied_doctype(doctype):
		frappe.throw(_("This document type cannot have a Raven channel", context=TRANSLATION_CONTEXT))
	if not frappe.db.exists(doctype, name):
		frappe.throw(_("Document not found", context=TRANSLATION_CONTEXT))

	workspace = get_chat_workspace()
	title = channel_name or document_title(doctype, name)
	unique_name = unique_channel_name(title, workspace)
	if channel_type not in {"Private", "Public", "Open"}:
		channel_type = "Private"

	channel = frappe.get_doc(
		{
			"doctype": "Raven Channel",
			"channel_name": unique_name,
			"type": channel_type,
			"workspace": workspace,
			"is_synced": 1 if is_synced else 0,
			"linked_doctype": doctype,
			"linked_document": name,
			"channel_description": _("Channel for {0} {1}", context=TRANSLATION_CONTEXT).format(
				doctype, name
			),
		}
	)
	channel.flags.do_not_add_member = True
	channel.insert(ignore_permissions=True)

	wanted = list(dict.fromkeys((members or []) + (invitees or [])))
	if not is_synced and frappe.session.user not in wanted:
		wanted.append(frappe.session.user)
	for index, user in enumerate(wanted):
		if invitees and user in invitees and not user_has_document_relationship(doctype, name, user):
			warn_user(
				_("{0} was not invited because they do not have access to this document.", context=TRANSLATION_CONTEXT).format(
					user
				)
			)
			continue
		grant_read_share_if_needed(doctype, name, user)
		add_channel_member(channel.name, user, is_admin=1 if index == 0 or user == frappe.session.user else 0)
	return channel.name


def sync_channel_members(channel: str, users: list[str]) -> None:
	wanted = {user for user in users if user}
	existing = set(
		frappe.get_all("Raven Channel Member", filters={"channel_id": channel}, pluck="user_id")
	)
	for user in wanted - existing:
		add_channel_member(channel, user)
	for user in existing - wanted:
		remove_channel_member(channel, user)


def archive_linked_channels(doctype: str, name: str) -> None:
	for channel in get_linked_channels(doctype, name):
		if channel.is_archived:
			continue
		frappe.db.set_value("Raven Channel", channel.name, "is_archived", 1)


def valid_team_users(project) -> list[str]:
	users: list[str] = []
	today = getdate()
	for row in project.get("custom_ts_details") or []:
		if row.get("virtual_worker"):
			continue
		user = row.get("pt_participant")
		if not user:
			continue
		valid_from = getdate(row.get("pt_valid_from")) if row.get("pt_valid_from") else None
		valid_for = getdate(row.get("pt_valid_for")) if row.get("pt_valid_for") else None
		if valid_from and today < valid_from:
			continue
		if valid_for and today > valid_for:
			continue
		users.append(user)
	return list(dict.fromkeys(users))
