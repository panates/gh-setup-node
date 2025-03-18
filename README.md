# Setup NodeJS Environment Action

This GitHub Action sets up a Node.js environment by installing Node.js, checking out the repository, installing
dependencies, and managing caching.

## 🚀 Features

- Installs a specified version of Node.js
- Checks out the repository
- Supports caching of `node_modules`
- Creates an `.npmrc` file for GitHub Packages
- Installs dependencies

## 📌 Usage

```yaml
jobs:
  setup-node-env:
    runs-on: ubuntu-latest
    steps:
      - name: Setup NodeJS Environment
        uses: panates/gh-setup-node@v1
        with:
          PERSONAL_ACCESS_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          fetch-depth: 0
          node-version: "20.18.3"
          cache: "true"
          cache-key: "my-cache-key"
          install-deps: "true"
```

## ⚙️ Inputs

| Name                    | Description                                        | Required | Default     |
|-------------------------|----------------------------------------------------|----------|-------------|
| `PERSONAL_ACCESS_TOKEN` | GitHub personal access token for authentication    | ✅ Yes    | N/A         |
| `fetch-depth`           | Number of commits to fetch. `0` means all history. | ❌ No     | `1`         |
| `node-version`          | Node.js version to install                         | ❌ No     | `"20.18.3"` |
| `cache`                 | Enable or disable caching of `node_modules`        | ❌ No     | `"true"`    |
| `cache-key`             | Unique cache key for caching                       | ❌ No     | `""`        |
| `install-deps`          | Install dependencies (`npm install`)               | ❌ No     | `"true"`    |

## 📝 Notes

- Ensure that `PERSONAL_ACCESS_TOKEN` has access to GitHub Packages if you're using private repositories.
- If caching is enabled, it will restore `node_modules` from cache using the specified cache key.

## 📄 License

This project is licensed under the **MIT License**.
