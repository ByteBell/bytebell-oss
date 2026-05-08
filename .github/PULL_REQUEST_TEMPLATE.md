# Pull Request Guide

Follow these conventions so every PR is easy to navigate, review, and merge.

---

## 1. Branch Naming

### General rules

- **Descriptive**: use clear, concise names that describe the purpose of the branch.
- **Lowercase only**: no uppercase letters.
- **Hyphens to separate words**: no spaces, no underscores.
- **No special characters**: avoid `!`, `@`, `#`, `$`, `%`, etc.
- **Always prefix** with the type of work (see below).

### Branch prefixes

| Prefix         | When to use                                 | Example                            |
| -------------- | ------------------------------------------- | ---------------------------------- |
| `feature/`     | New features or enhancements                | `feature/user-authentication`      |
| `bugfix/`      | Bug fixes                                   | `bugfix/login-issue`               |
| `hotfix/`      | Critical fixes that must ship immediately   | `hotfix/payment-gateway-error`     |
| `improvement/` | Non-feature improvements (refactors, perf)  | `improvement/refactor-auth-module` |
| `release/`     | Release prep                                | `release/v1.2.0`                   |
| `chore/`       | Maintenance: dependencies, configs, tooling | `chore/update-dependencies`        |
| `docs/`        | Documentation-only changes                  | `docs/update-readme`               |

---

## 2. PR Title

Every PR title must start with a **status tag** followed by the branch purpose.

### Status tags

| Tag      | Meaning                                                                  |
| -------- | ------------------------------------------------------------------------ |
| `[WIP]`  | Work in progress — do not merge yet. Reviewers may skim but not approve. |
| `[TEST]` | Ready for review and testing. Feedback welcome; not yet merge-ready.     |
| `[DONE]` | Reviewed, tested, and ready to merge.                                    |

Update the tag as the PR progresses — move from `[WIP]` → `[TEST]` → `[DONE]`.

### Examples

- `[WIP] feature/user-authentication — initial Bitbucket OAuth wiring`
- `[TEST] bugfix/login-issue — fix wrong org routing on re-login`
- `[DONE] chore/update-dependencies — bump fastify to 5.6`
- `[DONE] docs/update-readme`

---

## 3. PR Description

Every PR description must include these sections:

### What changed

A clear bulleted list of the concrete changes. Not a copy of the commit log — a human-readable summary.

### Why

The reason for the change. Link the ticket / issue / conversation that prompted it. If it's a bug fix, describe the bug.

### How to test

Step-by-step instructions a reviewer can follow to verify the change end-to-end. Include:

- Commands to run
- Endpoints to hit / UI flows to exercise
- Expected results

### Screenshots (frontend PRs only)

**Required** for any PR that touches UI. Include:

- **Before** screenshot of the current UI (omit for brand-new UI)
- **After** screenshot showing the PR's result
- For multi-state UIs (loading / empty / error / success), show each state
- For responsive changes, show both desktop and mobile widths

Use the GitHub image upload (drag and drop into the description box) — do not link to external image hosts.

---

## 4. Example PR Description

```markdown
## What changed

- Added `CreatedByBadge` component shared between Feedback and Chats pages
- Role-gated the badge to org admins only via `useAuth` hook
- Added `user_role` to the login response so the frontend can determine admin status

## Why

Org admins need to see who authored each feedback/chat entry for accountability.
Regular users always see their own content, so the createdBy chip is redundant for them.

Linked issue: #142

## How to test

1. Log in as `admin_user@emai.com` (role: `admin`)
2. Open `http://localhost/deadbytes-org/feedback?page=1` — avatar chip should appear on rows with a `createdBy`
3. Open `http://localhost/deadbytes-org/chats?page=1` — same behaviour
4. Log in as a regular user — the chip should NOT appear on either page

## Screenshots

### Feedback page — admin view

[screenshot-admin-feedback.png]

### Feedback page — regular user view

[screenshot-user-feedback.png]
```

---

## 5. Checklist Before Marking `[DONE]`

- [ ] Branch name follows the naming rules above
- [ ] Title starts with a status tag
- [ ] Description has **What / Why / How to test** sections
- [ ] Screenshots attached (frontend PRs only)
- [ ] All CI checks pass (formatting, build, tests)
- [ ] Self-reviewed the diff — no leftover debug logs, commented-out code, or secrets
- [ ] Rebased against the target branch so the diff is clean

Thanks for keeping the review process fast and the git history readable.
