app_name = "dinext_raven"
app_title = "Dinext Raven"
app_publisher = "Dinext"
app_description = "Dinext overlay for Raven messaging"
app_email = "info@dinext.ru"
app_license = "mit"

# Apps
# ------------------

required_apps = ["dinext_common", "raven"]

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "dinext_raven",
# 		"logo": "/assets/dinext_raven/logo.png",
# 		"title": "Dinext Raven",
# 		"route": "/dinext_raven",
# 		"has_permission": "dinext_raven.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
app_include_css = "/assets/dinext_raven/css/dinext_raven.css?v=discuss-dropdown-1"
app_include_js = [
	"/assets/dinext_raven/js/dinext_raven_widget.js?v=collapsed-overflow-1",
	"/assets/dinext_raven/js/dinext_raven_discuss.js?v=kanban-card-raven-1",
]

# include js, css files in header of web template
# web_include_css = "/assets/dinext_raven/css/dinext_raven.css"
# web_include_js = "/assets/dinext_raven/js/dinext_raven.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "dinext_raven/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {"Project": "public/js/dinext_raven_project_form.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "dinext_raven/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "dinext_raven.utils.jinja_methods",
# 	"filters": "dinext_raven.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "dinext_raven.install.before_install"
after_install = "dinext_raven.install.after_install"
after_migrate = "dinext_raven.install.after_migrate"

# Uninstallation
# ------------

# before_uninstall = "dinext_raven.uninstall.before_uninstall"
# after_uninstall = "dinext_raven.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "dinext_raven.utils.before_app_install"
# after_app_install = "dinext_raven.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "dinext_raven.utils.before_app_uninstall"
# after_app_uninstall = "dinext_raven.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "dinext_raven.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"Project": {
		"after_insert": "dinext_raven.document_channels.project.ensure_project_channel",
		"on_update": "dinext_raven.document_channels.project.ensure_project_channel",
		"on_trash": "dinext_raven.document_channels.project.on_project_trash",
	}
}

dinext_settings_workspace_children = ["Raven"]

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"dinext_raven.tasks.all"
# 	],
# 	"daily": [
# 		"dinext_raven.tasks.daily"
# 	],
# 	"hourly": [
# 		"dinext_raven.tasks.hourly"
# 	],
# 	"weekly": [
# 		"dinext_raven.tasks.weekly"
# 	],
# 	"monthly": [
# 		"dinext_raven.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "dinext_raven.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "dinext_raven.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "dinext_raven.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["dinext_raven.utils.before_request"]
# after_request = ["dinext_raven.utils.after_request"]

# Job Events
# ----------
# before_job = ["dinext_raven.utils.before_job"]
# after_job = ["dinext_raven.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"dinext_raven.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

