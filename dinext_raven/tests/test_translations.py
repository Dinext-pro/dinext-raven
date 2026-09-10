# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

import csv
from pathlib import Path

from frappe.tests.utils import FrappeTestCase


class TestDinextRavenTranslations(FrappeTestCase):
	def test_discuss_strings_have_russian_translations(self):
		path = Path(__file__).resolve().parents[1] / "translations" / "ru.csv"
		with path.open(newline="", encoding="utf-8") as handle:
			rows = list(csv.DictReader(handle))
		by_source = {row["Source"]: row for row in rows}
		for source in (
			"Discuss",
			"Channels",
			"Send to chat or channel",
			"Create channel",
		):
			self.assertIn(source, by_source)
			self.assertTrue(by_source[source]["Перевод"])
			self.assertNotEqual(by_source[source]["Перевод"], source)
