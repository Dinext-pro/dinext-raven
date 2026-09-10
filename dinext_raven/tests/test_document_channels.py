# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import random_string

from dinext_common.setup.hub_catalog import SETTINGS_HUB_SETTINGS
from dinext_raven.document_channels.api import get_accessible_project_channel, get_document_channels
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

	def test_accessible_project_channel_filters_by_membership_and_role(self):
		if not frappe.db.exists("DocType", "Project"):
			self.skipTest("Project is not available")
		if not frappe.db.exists("DocType", "Raven Channel"):
			self.skipTest("Raven is not installed")
		ensure_chat_workspace()
		project = self._make_project()
		member = self._make_isolated_user("chan-member", raven_user=True)
		outsider = self._make_isolated_user("chan-out", raven_user=True)
		no_role = self._make_isolated_user("chan-norole", raven_user=False)
		self._share_project(project, member)
		self._share_project(project, outsider)
		self._share_project(project, no_role)

		self.assertIsNone(get_accessible_project_channel(project))

		channel = create_linked_channel(
			"Project",
			project,
			channel_name=f"proj-{random_string(4)}",
			channel_type="Private",
			is_synced=1,
			members=[member],
		)
		channel_name = frappe.db.get_value("Raven Channel", channel, "channel_name")

		try:
			frappe.set_user(member)
			payload = get_accessible_project_channel(project)
			self.assertTrue(payload)
			self.assertEqual(payload["name"], channel)
			self.assertEqual(payload["channel_name"], channel_name)

			frappe.set_user(outsider)
			self.assertIsNone(get_accessible_project_channel(project))

			frappe.set_user(no_role)
			self.assertIsNone(get_accessible_project_channel(project))
		finally:
			frappe.set_user("Administrator")

		frappe.db.set_value("Raven Channel", channel, "is_archived", 1)
		frappe.set_user(member)
		try:
			self.assertIsNone(get_accessible_project_channel(project))
		finally:
			frappe.set_user("Administrator")

	def test_get_document_channels_filters_unreadable_and_archived(self):
		if not frappe.db.exists("DocType", "Project"):
			self.skipTest("Project is not available")
		if not frappe.db.exists("DocType", "Raven Channel"):
			self.skipTest("Raven is not installed")
		ensure_chat_workspace()
		project = self._make_project()
		member = self._make_isolated_user("docchan-member", raven_user=True)
		outsider = self._make_isolated_user("docchan-out", raven_user=True)
		other = self._make_isolated_user("docchan-other", raven_user=True)
		self._share_project(project, member)
		self._share_project(project, outsider)

		readable = create_linked_channel(
			"Project",
			project,
			channel_name=f"visible-{random_string(4)}",
			channel_type="Private",
			is_synced=1,
			members=[member],
		)
		hidden = create_linked_channel(
			"Project",
			project,
			channel_name=f"hidden-{random_string(4)}",
			channel_type="Private",
			is_synced=0,
			members=[other],
		)
		archived = create_linked_channel(
			"Project",
			project,
			channel_name=f"archived-{random_string(4)}",
			channel_type="Private",
			is_synced=0,
			members=[member],
		)
		frappe.db.set_value("Raven Channel", archived, "is_archived", 1)

		try:
			frappe.set_user(member)
			names = [row["name"] for row in get_document_channels("Project", project)]
			self.assertEqual(names, [readable])

			frappe.set_user(outsider)
			self.assertEqual(get_document_channels("Project", project), [])

			frappe.set_user("Administrator")
			admin_names = [row["name"] for row in get_document_channels("Project", project)]
			self.assertNotIn(readable, admin_names)
			self.assertNotIn(archived, admin_names)
			self.assertEqual(admin_names, [hidden])
		finally:
			frappe.set_user("Administrator")

		self.assertTrue(frappe.db.exists("Raven Channel", hidden))

	def _make_project(self) -> str:
		name = f"RAVEN-ICON-{random_string(6)}"
		project = frappe.get_doc(
			{
				"doctype": "Project",
				"project_name": name,
				"status": "Open",
			}
		)
		project.insert(ignore_permissions=True, ignore_mandatory=True, set_name=name)
		existing = get_synced_channel("Project", project.name)
		if existing:
			frappe.db.set_value("Raven Channel", existing, "is_synced", 0)
		return project.name

	def _share_project(self, project: str, user: str) -> None:
		frappe.get_doc(
			{
				"doctype": "DocShare",
				"name": random_string(10),
				"share_doctype": "Project",
				"share_name": project,
				"user": user,
				"read": 1,
			}
		).db_insert()
		frappe.clear_cache(user=user)

	def _make_isolated_user(self, prefix: str, raven_user: bool = False) -> str:
		email = f"{prefix}-{random_string(6).lower()}@example.com"
		user = frappe.get_doc(
			{
				"doctype": "User",
				"name": email,
				"email": email,
				"first_name": prefix.title(),
				"send_welcome_email": 0,
				"user_type": "System User",
				"enabled": 1,
			}
		)
		user.db_insert()
		if raven_user:
			frappe.get_doc(
				{
					"doctype": "Has Role",
					"name": random_string(10),
					"parent": email,
					"parenttype": "User",
					"parentfield": "roles",
					"role": "Raven User",
				}
			).db_insert()
			if frappe.db.exists("DocType", "Raven User") and not frappe.db.exists(
				"Raven User", {"user": email}
			):
				frappe.get_doc(
					{
						"doctype": "Raven User",
						"name": email,
						"type": "User",
						"user": email,
						"full_name": prefix.title(),
						"first_name": prefix.title(),
						"enabled": 1,
					}
				).db_insert()
		frappe.clear_cache(user=email)
		return email

	def _make_user(self, prefix: str) -> str:
		return self._make_isolated_user(prefix, raven_user=True)
