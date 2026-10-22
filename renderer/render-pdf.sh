#!/bin/zsh
# render-pdf.sh — typeset one prepared build folder and deliver the export folder.
#
#   zsh render-pdf.sh --job /path/to/build/job.json
#
# Copied and simplified from virtual-outliner's renderer/render-pdf.sh. The
# build folder is the folder holding job.json; the plugin has already written
# source.md, meta.tex, preamble.tex (LatexPre.tex, staged by stream copy),
# cite.tex, after.tex, meta.json and refs.bib there. job.py documents job.json.
#
# Pipeline: table widths -> list breaks -> pandoc to a standalone doc.tex
# (preamble inlined via -H, images extracted to media/) -> sanitize/optimize
# media -> table row lines -> latexmk -lualatex (runs biber) -> job.py deliver,
# which creates <parentDir>/<folderName> with a non-recursive mkdir and copies
# ONLY <stem>.pdf, <stem>.tex, refs.bib and media/ into it. Every latexmk/biber
# intermediate stays in the build folder.
#
# The LAST line on stdout is always one JSON status object, which is what the
# plugin parses: {"ok":true,"output":…} or {"ok":false,"stage":…,"message":…}.
# Everything else goes to render.log in the build folder.
#
# Run with /bin/zsh explicitly: sync services drop the executable bit, so
# nothing here relies on it.

emulate -L zsh
setopt no_nomatch pipe_fail
set -u

HERE=${0:A:h}
export PATH=/opt/homebrew/bin:/usr/local/bin:/Library/TeX/texbin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}

JOB=""
while (( $# )); do
  case $1 in
    --job) JOB=${2:-}; shift 2 ;;
    *) shift ;;
  esac
done

PY=python3
(( $+commands[python3] )) || PY=/usr/bin/python3

fail_json() {
  # stage, message
  "$PY" "$HERE/job.py" status-fail "$1" "$2" 2>/dev/null \
    || print -r -- '{"ok":false,"stage":"'"$1"'","message":"renderer failure"}'
  exit 1
}

[[ -n $JOB && -f $JOB ]] || fail_json args "No job file given (expected --job <job.json>)."
JOB=${JOB:A}
BUILD=${JOB:h}
cd "$BUILD" || fail_json args "Cannot enter build folder $BUILD"

LOG="$BUILD/render.log"
source "$HERE/lib.sh"
rm -rf media doc.* work*.md pandoc.out latexmk.out rd.latexmkrc
log "=== render $JOB"

for tool in pandoc latexmk lualatex biber; do
  (( $+commands[$tool] )) || fail_json tools "$tool was not found. Install pandoc and MacTeX (latexmk, lualatex, biber)."
done

# Shell assignments for the job's fields (values shell-quoted by job.py).
ENV_OUT=$("$PY" "$HERE/job.py" env "$JOB" 2>>"$LOG") || fail_json job "$(tail -3 "$LOG")"
eval "$ENV_OUT"

"$PY" "$HERE/tables.py" "$JOB_SOURCE" work-tables.md 2>>"$LOG" || cp "$JOB_SOURCE" work-tables.md
"$PY" "$HERE/lists.py" work-tables.md work-final.md 2>>"$LOG" || cp work-tables.md work-final.md

args=(
  -f markdown+mark
  -t latex -s -o doc.tex
  --extract-media=media
  --resource-path="$BUILD:$JOB_RESOURCE_PATH"
  --metadata-file="$JOB_METADATA"
  -V fontsize=12pt -V papersize=letter
)
for header in "${(@ps:\n:)JOB_HEADERS}"; do
  [[ -n $header ]] && args+=(-H "$header")
done
[[ -n $JOB_AFTER ]] && args+=(-A "$JOB_AFTER")
(( JOB_HEADING_SHIFT )) && args+=(--shift-heading-level-by="$JOB_HEADING_SHIFT")

log "  pandoc ${args[*]}"
if ! pandoc work-final.md "${args[@]}" >pandoc.out 2>&1; then
  cat pandoc.out >>"$LOG"
  fail_json pandoc "$(tail -15 pandoc.out)"
fi
[[ -s pandoc.out ]] && cat pandoc.out >>"$LOG"

renames=$(sanitize_media media)
if [[ -n $renames ]]; then
  while IFS=$'\t' read -r old new; do
    [[ -n $old ]] || continue
    LC_ALL=C sed -i '' "s|media/${old}|media/${new}|g" doc.tex
  done <<< "$renames"
fi
optimize_media media
"$PY" "$HERE/rowlines.py" doc.tex >>"$LOG" 2>&1

latexmk_args=(-lualatex -interaction=nonstopmode -halt-on-error -file-line-error)
if [[ -n $JOB_BIBLIOGRAPHY ]]; then
  BIBER=$(resolve_biber) || fail_json tools "biber is installed but will not run on this Mac. See $LOG."
  log "  biber: $BIBER"
  print -r -- "\$biber = q{\"$BIBER\" %O %S};" > rd.latexmkrc
  latexmk_args+=(-r rd.latexmkrc)
fi

log "  latexmk ${latexmk_args[*]}"
if ! latexmk "${latexmk_args[@]}" doc.tex >latexmk.out 2>&1; then
  fail_json latex "$("$PY" "$HERE/job.py" latex-errors doc.log doc.blg 2>/dev/null)"
fi

"$PY" "$HERE/job.py" deliver "$JOB" 2>>"$LOG"
