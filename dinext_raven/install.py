# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Install / migrate hooks for Dinext Raven."""

from __future__ import annotations


def after_install() -> None:
	from dinext_raven.setup.workspace import setup_dinext_raven

	setup_dinext_raven()


def after_migrate() -> None:
	from dinext_raven.setup.workspace import setup_dinext_raven

	setup_dinext_raven()
