# Setup NodeJS Environment Action

Checks out the repository, installs Node.js, configures npm authentication, and installs
dependencies.

## 🚀 Features

- Checks out the repository and installs a specified version of Node.js
- Configures npm so that **Trusted Publishing (OIDC)** actually works
- Maps scopes to GitHub Packages (`npm.pkg.github.com`) and authenticates them
- Installs dependencies from the lockfile, and caches npm's download cache
- Optionally installs a pinned `rman` globally

## 📌 Usage

```yaml
steps:
  - uses: panates/gh-setup-node@v2
    with:
      fetch-depth: 0          # a release workflow needs full history and tags
      node-version: "24"
```

Publishing to GitHub Packages as well:

```yaml
steps:
  - uses: panates/gh-setup-node@v2
    with:
      github-registries: "panates"
      token: ${{ secrets.PERSONAL_ACCESS_TOKEN }}
```

## ⚙️ Inputs

| Name                | Description                                                                                   | Default                      |
|---------------------|-----------------------------------------------------------------------------------------------|------------------------------|
| `token`             | GitHub token, used **only** for `npm.pkg.github.com`. Required when `github-registries` is set. | `""`                         |
| `fetch-depth`       | Commits to fetch. `0` means all history **and tags**.                                          | `"1"`                        |
| `node-version`      | Node.js version.                                                                               | `"lts/*"`                    |
| `registry-url`      | Default npm registry. Leave as-is for OIDC; `""` skips npm configuration entirely.             | `https://registry.npmjs.org` |
| `npm-token`         | Auth token for that registry. **Omit it to use Trusted Publishing.**                           | `""`                         |
| `github-registries` | Scopes to **route** to GitHub Packages, comma separated, without the `@`. `"auto"` derives them. | `""`                         |
| `install`           | `"ci"`, `"install"`, or `"false"`.                                                             | `"ci"`                       |
| `cache`             | Cache npm's download cache, keyed by the lockfile. Needs a lockfile.                           | `"true"`                     |
| `rman-version`      | Install this rman version globally, e.g. `"2"`. Empty installs nothing.                        | `""`                         |

## 🔐 npm Trusted Publishing (OIDC)

**This is why v2 exists.** v1 called `setup-node` without `registry-url`, and npm only attempts the
OIDC exchange when a registry is configured — without it, publishing fails with `ENEEDAUTH`
regardless of how the calling workflow was set up. Any workflow built on v1 could publish with a
token and only with a token.

Setting `registry-url` introduces a second problem that this action now handles for you.
`setup-node` writes

```
//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}
```

into the file `NPM_CONFIG_USERCONFIG` points at — **not** `~/.npmrc`, and not the workspace. With no
`NODE_AUTH_TOKEN` that reference resolves to nothing, and npm reads *having* an `_authToken` entry as
already being authenticated, so it never reaches for OIDC, sends a credential that is not one, and
the registry answers `404` (npm returns 404 rather than 403 so nobody can probe which packages
exist). See [actions/setup-node#1551](https://github.com/actions/setup-node/issues/1551).

The `Configure npm auth` step strips every `_authToken` line first, then writes back only what you
actually supplied. So:

- **No `npm-token`** → OIDC is the only credential left, which is what you want.
- **`npm-token` given** → it is used, and it is never left competing with the placeholder.

Trusted Publishing is **npmjs.org only**. `npm.pkg.github.com` always needs a real `token`.

## 📦 GitHub Packages — three jobs, and only one needs a scope list

`github-registries` used to be required for all of this. Measured, it is required for one third of
it:

| Job | What it needs | Where it comes from |
|-----|---------------|---------------------|
| **Publish** — routing | nothing | `publishConfig.registry`; `npm publish --dry-run` with no scope mapping anywhere still reported `Publishing to https://npm.pkg.github.com/` |
| **Publish / install** — auth | `//npm.pkg.github.com/:_authToken=` | `token` alone. npm keys auth by **registry, not scope** — with the mapping in a project `.npmrc` and the auth line in the userconfig only, npm still sent `Authorization: Bearer` |
| **Install** — routing | `@scope:registry=` | **the only thing `github-registries` is for** |

So to *publish* to GitHub Packages, pass `token` and nothing else. You need `github-registries` only
to *install* a dependency hosted there, and only when the repository commits no `.npmrc` of its own.

### `github-registries: "auto"`

Derives the list from every `package.json` whose `publishConfig.registry` points at GitHub Packages
([`scripts/github-package-scopes.mjs`](./scripts/github-package-scopes.mjs)).

**It answers "what do we publish there", which is a guess at "what do we install from there".** It
is a good guess where one scope is both, and it is silently empty for a repository that publishes to
npmjs.org and merely consumes `@acme/private` — that scope appears in no `publishConfig` here. The
step warns when it derives nothing; list the scope explicitly in that case.

It deliberately does **not** use rman, although rman is the right authority on which directories hold
packages. The scopes are needed to route `npm ci`, so this runs before `node_modules` exists — and a
repository whose `.rmanrc` says `extends: "@panates/rman-preset"` then fails with `"extends" target
"@panates/rman-preset" could not be resolved ... is it installed in this repository?`, because the
preset is one of the packages the install was about to fetch. `npx rman@<major>` does not help
either: it resolves rman into a temp directory where the preset is equally absent.

Your job must also grant:

```yaml
permissions:
  id-token: write
```

## 📝 Notes

- **`git` is authenticated with the job's own `GITHUB_TOKEN`**, not with `token` — the checkout does
  not take one. That is usually what you want: a push made with `GITHUB_TOKEN` does not trigger
  workflows, so a release workflow that pushes a version bump will not start a second run of itself.
  A job that must push to a protected branch should check out itself instead of using this action.
- **`install: ci` is the default and will fail if `package.json` and `package-lock.json` disagree.**
  That is a real defect in the repository — the fix is `npm install --package-lock-only` and
  committing the result. `install: install` is the way down if you cannot do that today. Do not go
  back to deleting the lockfile: it means every build resolves dependency versions nobody pinned or
  tested.
- `cache: "true"` caches npm's download cache (`~/.npm`), keyed by the lockfile. It does **not**
  cache `node_modules`, which is not portable across Node versions.

## 🚚 Migrating from v1

| v1                                  | v2                                                                       |
|-------------------------------------|--------------------------------------------------------------------------|
| `install-deps: "true"` / `"false"`  | `install: "ci"` / `"false"`                                              |
| `cache-key`                         | removed — the lockfile hash is the key                                   |
| `token` (required)                  | optional, and only for `github-registries`                               |
| rman installed globally, unpinned   | `rman-version: "2"`, or omit it and call rman through `npx rman@2`       |

v1 also deleted `package-lock.json` before installing and installed `rman` globally twice. Both are
gone.

## 📄 License

This project is licensed under the **MIT License**.
