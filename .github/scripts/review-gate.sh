#!/usr/bin/env bash
# Gate B evidence check. See CLAUDE.md "Review gate (Gate B)".
#
# There is no second GitHub account here to grant a real "required approval",
# so this checks for review *evidence* in the tree instead: a large or
# sensitive diff must ship a reviews/<diff-hash>.md containing "verdict: PASS",
# where <diff-hash> is a sha256 of the PR's diff against its base branch (path,
# status and patch text per changed file), so the review is bound to the exact
# code changes it reviewed, not just to the PR number.
#
# This used to hash the head commit's *tree* instead of its diff. That was
# self-referential: adding reviews/<hash>.md is itself a commit, which changes
# the head commit's tree, which changes the hash the file would need to be
# named — so no PR that triggered the gate could ever satisfy it. Verified by
# reproduction (clone, compute tree hash, add the named file, recompute — the
# hash moves). Hashing the diff against base instead, with reviews/ excluded
# from the inputs, is stable under adding the evidence file, because that file
# was never part of what gets hashed.
#
# Uses the GitHub API (via `gh`) rather than `git fetch`/`git diff`: this
# remote does not allow fetching a bare commit SHA that isn't a ref tip, only
# named refs, and the compare API gives the same base...head diff GitHub's own
# "Files changed" tab shows without needing local history at all.
#
# This cannot and does not check *who* wrote that file. That the reviewing
# agent must be a different one than the one that wrote the diff is a process
# rule, not a thing this script can prove.
set -euo pipefail

PR_NUMBER="${1:?pr number required}"
SENSITIVE='^(lib/planner/|lib/food/|app/api/|lib/auth\.ts)'

PR_JSON=$(gh pr view "$PR_NUMBER" --json additions,deletions,files,headRefOid,baseRefName)
LINES=$(echo "$PR_JSON" | jq -r '.additions + .deletions')
HEAD_SHA=$(echo "$PR_JSON" | jq -r '.headRefOid')
BASE_REF=$(echo "$PR_JSON" | jq -r '.baseRefName')

SENSITIVE_HIT=false
echo "$PR_JSON" | jq -r '.files[].path' | grep -qE "$SENSITIVE" && SENSITIVE_HIT=true

if [ "$LINES" -le 50 ] && [ "$SENSITIVE_HIT" = false ]; then
  echo "Diff is $LINES lines and touches no sensitive path — no review evidence required."
  exit 0
fi

echo "Diff is $LINES lines (sensitive path touched: $SENSITIVE_HIT) — review evidence required."

DIFF_HASH=$(gh api "repos/${GITHUB_REPOSITORY}/compare/${BASE_REF}...${HEAD_SHA}" --jq '
  [.files[] | select(.filename | startswith("reviews/") | not)]
  | sort_by(.filename)
  | map(.filename + "\t" + (.previous_filename // "") + "\t" + .status + "\n" + (.patch // "") + "\n")
  | join("")
' | sha256sum | cut -d" " -f1)
REVIEW_PATH="reviews/${DIFF_HASH}.md"

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
