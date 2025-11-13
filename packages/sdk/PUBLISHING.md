# Publishing to npm

This guide covers how to publish `@substancelabs/aztec-evm-bridge-sdk` to npmjs.

## Prerequisites

### 1. Create an npm Account
If you don't have one already:
- Go to https://www.npmjs.com/signup
- Create an account

### 2. Create an Organization (if needed)
Since the package is scoped as `@substancelabs`, you need to:
- Go to https://www.npmjs.com/org/create
- Create the `substancelabs` organization
- Or join if it already exists

### 3. Login to npm
```bash
npm login
```

This will prompt for:
- Username
- Password
- Email
- One-time password (if 2FA is enabled)

Verify you're logged in:
```bash
npm whoami
```

## Publishing Process

### Option 1: Using Changesets (Recommended)

This is the automated way we've set up:

```bash
# 1. Navigate to root
cd /home/envin/Work/aztec/aztec-evm-bridge

# 2. Create a changeset (if not already done)
yarn changeset
# Select @substancelabs/aztec-evm-bridge-sdk
# Choose version bump type (major/minor/patch)
# Write a summary of changes

# 3. Commit the changeset
git add .changeset/
git commit -m "chore: add changeset for release"

# 4. Version packages (consumes changesets, updates package.json and CHANGELOG)
yarn version

# 5. Review the changes
git diff

# 6. Commit version changes
git add .
git commit -m "chore: version packages"

# 7. Build and publish
yarn release
# This runs: yarn build && changeset publish

# 8. Push with tags
git push --follow-tags
```

### Option 2: Manual Publishing

If you prefer manual control:

```bash
# 1. Navigate to SDK package
cd /home/envin/Work/aztec/aztec-evm-bridge/packages/sdk

# 2. Build the package
yarn build

# 3. Verify the build output
ls -la dist/

# 4. Check what will be published
npm pack --dry-run

# 5. Test the package locally (optional)
npm pack
# This creates a .tgz file you can test in another project

# 6. Publish to npm
npm publish

# 7. Create a git tag
git tag @substancelabs/aztec-evm-bridge-sdk@0.0.1
git push origin @substancelabs/aztec-evm-bridge-sdk@0.0.1
```

## Verify Publication

After publishing, verify at:
- https://www.npmjs.com/package/@substancelabs/aztec-evm-bridge-sdk

Test installation in a new project:
```bash
npm install @substancelabs/aztec-evm-bridge-sdk
# or
yarn add @substancelabs/aztec-evm-bridge-sdk
```

## Troubleshooting

### "You do not have permission to publish"
- Make sure you're logged in: `npm whoami`
- Ensure you have access to the `@substancelabs` organization
- Check that `publishConfig.access` is set to "public" in package.json

### "Package already exists"
- You cannot republish the same version
- Bump the version in package.json and try again

### "Invalid package name"
- Scoped packages must start with @
- Organization name must match your npm org

### "No README data"
- Add a README.md file to the SDK package
- Include it in the "files" array in package.json

## Version Numbering

Follow semantic versioning (semver):
- **Patch** (0.0.X): Bug fixes, no API changes
- **Minor** (0.X.0): New features, backwards compatible
- **Major** (X.0.0): Breaking changes

For pre-releases, use tags:
- `0.1.0-alpha.1`
- `0.1.0-beta.1`
- `0.1.0-rc.1`

## CI/CD Automation (Optional)

You can automate releases using GitHub Actions. See the main `RELEASING.md` for examples.

## Package Access

The package is configured as **public** (`publishConfig.access: "public"`), meaning:
- Anyone can install it
- It appears in npm search results
- No authentication needed to download

To make it private (requires paid npm account):
```json
"publishConfig": {
  "access": "restricted"
}
```
