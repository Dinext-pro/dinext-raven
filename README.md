# Dinext Raven

Empty Dinext product overlay for the installed Raven messaging app. Customizations belong here; upstream `raven` stays a separate application.

**Required apps:** `dinext_common`, `raven`

**GitLab:** https://dinext.gitlab.yandexcloud.net/erpnext/dinext/dinext-raven

## Installation

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app https://dinext.gitlab.yandexcloud.net/erpnext/dinext/dinext-raven.git --branch develop
bench --site <site> install-app raven
bench --site <site> install-app dinext_raven
```

`install-app dinext_raven` fails unless `raven` is already installed on the site.

## License

mit
