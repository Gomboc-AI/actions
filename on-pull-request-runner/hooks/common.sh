#!/usr/bin/env sh
set -eu

ORL_DIAG_DIR="${ORL_DIAG_DIR:-/workspace/.orl/diagnostics}"
mkdir -p "$ORL_DIAG_DIR"

GOMBOC_GIT_NAME="${GOMBOC_GIT_NAME:-github-actions[bot]}"
GOMBOC_GIT_EMAIL="${GOMBOC_GIT_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}"

gomboc_git() {
  git \
    -c "user.name=${GOMBOC_GIT_NAME}" \
    -c "user.email=${GOMBOC_GIT_EMAIL}" \
    "$@"
}

# Builds a conventional commit subject for one remediated finding.
# $1 rule name, $2 space-separated finding file paths, $3 space-separated changed paths
gomboc_commit_message() {
  rule_name="$1"
  finding_files="$2"
  changed_paths="$3"

  file_summary=""
  if [ -n "$finding_files" ]; then
    for file in $finding_files; do
      base=$(basename "$file")
      if [ -z "$file_summary" ]; then
        file_summary="$base"
      else
        file_summary="$file_summary, $base"
      fi
    done
  fi

  if [ -z "$file_summary" ]; then
    for file in $changed_paths; do
      base=$(basename "$file")
      if [ -z "$file_summary" ]; then
        file_summary="$base"
      else
        file_summary="$file_summary, $base"
      fi
    done
  fi

  if [ -n "$file_summary" ]; then
    printf 'fix(gomboc): %s (%s)' "$rule_name" "$file_summary"
  else
    printf 'fix(gomboc): %s' "$rule_name"
  fi
}

# Appends one JSON object line to manifest.jsonl (no external JSON tools).
gomboc_append_manifest() {
  rule_name="$1"
  message="$2"
  files="$3"

  escaped_message=$(printf '%s' "$message" | sed 's/\\/\\\\/g; s/"/\\"/g')
  files_json=""
  for file in $files; do
    escaped_file=$(printf '%s' "$file" | sed 's/\\/\\\\/g; s/"/\\"/g')
    if [ -z "$files_json" ]; then
      files_json="\"$escaped_file\""
    else
      files_json="$files_json,\"$escaped_file\""
    fi
  done

  printf '{"rule":"%s","message":"%s","files":[%s]}\n' \
    "$rule_name" "$escaped_message" "$files_json" >>"$ORL_DIAG_DIR/manifest.jsonl"
}
