# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import random_string

from dinext_common.setup.hub_catalog import SETTINGS_HUB_SETTINGS
from dinext_raven.document_channels.api import get_document_channels
from dinext_raven.document_channels.project import (
	backfill_project_channels,
	ensure_project_channel,
	on_project_trash,
	project_available,
)
from dinext_raven.document_channels.service import (
	create_linked_channel,
	get_synced_channel,
	is_denied_doctype,
	slugify_channel_name,
	sync_channel_members,
	unique_channel_name,
	user_can_read_document,
)
from dinext_raven.setup.workspace import (
	CHAT_WORKSPACE,
	DESK_WORKSPACE,
	DINEXT_CHAT_LOGO,
	ensure_chat_workspace,
	get_chat_workspace,
	nest_desk_workspace,
	register_settings_hub_card,
)


class TestDinextRavenDocumentChannels(FrappeTestCase):
	def test_file_is_allowed_and_version_is_denied(self):
		self.assertFalse(is_denied_doctype("File"))
		self.assertTrue(is_denied_doctype("Version"))
		self.assertTrue(is_denied_doctype("DocShare"))
		self.assertTrue(is_denied_doctype("Raven Channel"))

	def test_slugify_and_unique_suffix(self):
		self.assertEqual(slugify_channel_name("My Project"), "my-project")
		if not frappe.db.exists("DocType", "Raven Channel"):
			self.skipTest("Raven is not installed")
		workspace = get_chat_workspace()
		base = f"uniq-{random_string(6).lower()}"
		self.assertEqual(unique_channel_name(base, workspace), base)
		frappe.get_doc(
			{
				"doctype": "Raven Channel",
				"channel_name": base,
				"type": "Private",
				"workspace": workspace,
			}
		).insert(ignore_permissions=True)
		self.assertEqual(unique_channel_name(base, workspace), f"{base}-2")

	def test_invite_denies_stranger_and_keeps_assignee_share(self):
		if not frappe.db.exists("DocType", "Raven Channel"):
			self.skipTest("Raven is not installed")
		ensure_chat_workspace()
		doc = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": f"raven-{random_string(6)}.txt",
				"content": "raven-channel-test",
				"is_private": 1,
			}
		).insert(ignore_permissions=True)
		stranger = self._make_user("stranger")
		assignee = self._make_user("assignee")
		doc.db_set("_assign", frappe.as_json([assignee]))

		channel = create_linked_channel(
			"File",
			doc.name,
			channel_name=f"file-{random_string(4)}",
			channel_type="Private",
			is_synced=0,
			members=[assignee],
			invitees=[stranger],
		)
		self.assertFalse(
			frappe.db.exists("Raven Channel Member", {"channel_id": channel, "user_id": stranger})
		)
		self.assertFalse(
			frappe.db.exists("DocShare", {"share_doctype": "File", "share_name": doc.name, "user": stranger})
		)
		self.assertTrue(
			frappe.db.exists("Raven Channel Member", {"channel_id": channel, "user_id": assignee})
		)
		if not user_can_read_document("File", doc.name, assignee):
			share = frappe.db.get_value(
				"DocShare",
				{"share_doctype": "File", "share_name": doc.name, "user": assignee},
				["read", "write"],
				as_dict=True,
			)
			self.assertTrue(share)
			self.assertEqual(share.read, 1)

	def test_sync_channel_members_adds_and_removes(self):
		if not frappe.db.exists("DocType", "Raven Channel"):
			self.skipTest("Raven is not installed")
		ensure_chat_workspace()
		doc = frappe.get_doc({"doctype": "ToDo", "description": f"Sync {random_string(6)}"}).insert()
		first = self._make_user("sync-a")
		second = self._make_user("sync-b")
		channel = create_linked_channel(
			"ToDo",
			doc.name,
			channel_name=f"sync-{random_string(4)}",
			is_synced=0,
			members=[first],
		)
		self.assertTrue(
			frappe.db.exists("Raven Channel Member", {"channel_id": channel, "user_id": first})
		)
		sync_channel_members(channel, [second])
		self.assertFalse(
			frappe.db.exists("Raven Channel Member", {"channel_id": channel, "user_id": first})
		)
		self.assertTrue(
			frappe.db.exists("Raven Channel Member", {"channel_id": channel, "user_id": second})
		)

	def test_get_document_channels_rejects_denylisted_doctype(self):
		if frappe.db.exists("Version"):
			with self.assertRaises(frappe.ValidationError):
				get_document_channels("Version", "does-not-matter")

	def test_project_backfill_is_idempotent_and_cancel_does_not_archive(self):
		if not project_available():
			self.skipTest("Project team table is not available")
		if not frappe.db.exists("DocType", "Raven Channel"):
			self.skipTest("Raven is not installed")
		ensure_chat_workspace()
		if frappe.db.exists("Project"):
			project = frappe.get_doc("Project", frappe.db.get_value("Project", {}, "name"))
			ensure_project_channel(project)
			channel = get_synced_channel("Project", project.name)
			self.assertTrue(channel)
			ensure_project_channel(frappe.get_doc("Project", project.name))
			self.assertEqual(get_synced_channel("Project", project.name), channel)
			backfill_project_channels()
			self.assertEqual(get_synced_channel("Project", project.name), channel)
			self.assertEqual(
				len(
					frappe.get_all(
						"Raven Channel",
						filters={
							"linked_doctype": "Project",
							"linked_document": project.name,
							"is_synced": 1,
							"is_direct_message": 0,
						},
					)
				),
				1,
			)

			cancelled = frappe.get_doc("Project", project.name)
			cancelled.status = "Cancelled"
			ensure_project_channel(cancelled)
			self.assertEqual(frappe.db.get_value("Raven Channel", channel, "is_archived"), 0)

		dummy = f"NO-PROJ-{random_string(6)}"
		linked = frappe.get_doc(
			{
				"doctype": "Raven Channel",
				"channel_name": f"trash-{random_string(4)}",
				"type": "Private",
				"workspace": get_chat_workspace(),
			}
		).insert(ignore_permissions=True)
		frappe.db.set_value(
			"Raven Channel",
			linked.name,
			{"linked_doctype": "Project", "linked_document": dummy},
			update_modified=False,
		)
		on_project_trash(frappe._dict(name=dummy))
		self.assertEqual(frappe.db.get_value("Raven Channel", linked.name, "is_archived"), 1)

	def test_chat_workspace_rename_leaves_desk_raven(self):
		if not frappe.db.exists("DocType", "Raven Workspace"):
			self.skipTest("Raven is not installed")
		ensure_chat_workspace()
		self.assertTrue(frappe.db.exists("Raven Workspace", CHAT_WORKSPACE))
		self.assertFalse(frappe.db.exists("Raven Workspace", "Raven"))
		self.assertEqual(frappe.db.get_value("Raven Workspace", CHAT_WORKSPACE, "logo"), DINEXT_CHAT_LOGO)
		ensure_chat_workspace()
		self.assertEqual(frappe.db.get_value("Raven Workspace", CHAT_WORKSPACE, "name"), CHAT_WORKSPACE)
		self.assertEqual(frappe.db.get_value("Raven Workspace", CHAT_WORKSPACE, "logo"), DINEXT_CHAT_LOGO)
		if frappe.db.exists("Workspace", DESK_WORKSPACE):
			self.assertEqual(frappe.db.get_value("Workspace", DESK_WORKSPACE, "name"), DESK_WORKSPACE)

	def test_desk_raven_is_settings_child_and_hub_card(self):
		if not frappe.db.exists("Workspace", DESK_WORKSPACE):
			self.skipTest("Desk Workspace Raven is not installed")
		nest_desk_workspace()
		register_settings_hub_card()
		self.assertEqual(frappe.db.get_value("Workspace", DESK_WORKSPACE, "parent_page"), "Settings")
		self.assertEqual(frappe.db.get_value("Workspace", DESK_WORKSPACE, "is_hidden"), 0)
		self.assertEqual(frappe.db.get_value("Workspace", DESK_WORKSPACE, "public"), 1)
		self.assertTrue(
			frappe.db.exists(
				"Dinext Workspace Settings Item",
				{"parent": SETTINGS_HUB_SETTINGS, "element_type": "Workspace", "target": DESK_WORKSPACE},
			)
		)

	def _make_user(self, prefix: str) -> str:
		email = f"{prefix}-{random_string(6).lower()}@example.com"
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": prefix.title(),
				"send_welcome_email": 0,
				"user_type": "System User",
			}
		)
		user.insert(ignore_permissions=True)
		return user.name
