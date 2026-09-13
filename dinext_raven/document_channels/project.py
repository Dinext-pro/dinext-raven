# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Synced Private channel per Project."""

from __future__ import annotations

import frappe

from dinext_raven.document_channels.service import (
	archive_linked_channels,
	create_linked_channel,
	document_title,
	get_synced_channel,
	sync_channel_members,
	valid_team_users,
)

PROJECT_DOCTYPE = "Project"
TEAM_FIELD = "custom_ts_details"


def project_available() -> bool:
	if not frappe.db.exists("DocType", PROJECT_DOCTYPE):
		return False
	return frappe.get_meta(PROJECT_DOCTYPE).has_field(TEAM_FIELD)


def ensure_project_channel(doc, method=None) -> None:
	if not project_available():
		return
	if getattr(doc, "status", None) == "Cancelled":
		return
	channel = get_synced_channel(PROJECT_DOCTYPE, doc.name)
	members = valid_team_users(doc)
	if not channel:
		create_linked_channel(
			PROJECT_DOCTYPE,
			doc.name,
			channel_name=document_title(PROJECT_DOCTYPE, doc.name),
			channel_type="Private",
			is_synced=1,
			members=members,
		)
		return
	sync_channel_members(channel, members)


def on_project_trash(doc, method=None) -> None:
	if not frappe.db.exists("DocType", "Raven Channel"):
		return
	archive_linked_channels(PROJECT_DOCTYPE, doc.name)


def backfill_project_channels() -> None:
	if not project_available():
		return
	for name in frappe.get_all(PROJECT_DOCTYPE, pluck="name"):
		doc = frappe.get_doc(PROJECT_DOCTYPE, name)
		ensure_project_channel(doc)
