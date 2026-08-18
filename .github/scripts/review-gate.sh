#!/usr/bin/env bash
# Gate B evidence check. See CLAUDE.md "Review gate (Gate B)".
#
# There is no second GitHub account here to grant a real "required approval",
# so this checks for review *evidence* in the tree instead: a large or
# sensitive diff must ship a reviews/<tree-hash>.md containing "verdict: PASS",
# where <tree-hash> is the git tree hash of the PR's head commit — so the
# review is bound to the exact code it reviewed, not just to the PR number.
#
# Uses the GitHub API (via `gh`) rather than `git fetch`: this remote does not
# allow fetching a bare commit SHA that isn't a ref tip, only named refs.
#
# This cannot and does not check *who* wrote that file. That the reviewing
# agent must be a different one than the one that wrote the diff is a process
# rule, not a thing this script can prove.
set -euo pipefail

PR_NUMBER="${1:?pr number required}"
SENSITIVE='^(lib/planner/|lib/food/|app/api/|lib/auth\.ts)'

PR_JSON=$(gh pr view "$PR_NUMBER" --json additions,deletions,files,headRefOid)
LINES=$(echo "$PR_JSON" | jq -r '.additions + .deletions')
HEAD_SHA=$(echo "$PR_JSON" | jq -r '.headRefOid')

SENSITIVE_HIT=false
echo "$PR_JSON" | jq -r '.files[].path' | grep -qE "$SENSITIVE" && SENSITIVE_HIT=true

if [ "$LINES" -le 50 ] && [ "$SENSITIVE_HIT" = false ]; then
  echo "Diff is $LINES lines and touches no sensitive path — no review evidence required."
  exit 0
fi

echo "Diff is $LINES lines (sensitive path touched: $SENSITIVE_HIT) — review evidence required."

TREE=$(gh api "repos/${GITHUB_REPOSITORY}/commits/${HEAD_SHA}" --jq '.commit.tree.sha')
REVIEW_PATH="reviews/${TREE}.md"

if ! RAW=$(gh api "repos/${GITHUB_REPOSITORY}/contents/${REVIEW_PATH}?ref=${HEAD_SHA}" --jq '.content' 2>/dev/null); then
  echo "::error::Missing $REVIEW_PATH for PR #$PR_NUMBER (head $HEAD_SHA)."
  echo "Add that file, containing the line 'verdict: PASS', before this can merge."
  exit 1
fi

if ! echo "$RAW" | base64 -d | grep -qx 'verdict: PASS'; then
  echo "::error::$REVIEW_PATH exists but has no line reading exactly 'verdict: PASS'."
  exit 1
fi

echo "$REVIEW_PATH found with verdict: PASS."
