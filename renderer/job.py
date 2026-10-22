#!/usr/bin/env python3
"""Job helper for render-pdf.sh (Python 3.9+, stdlib only).

Copied and simplified from virtual-outliner's renderer/job.py. A job is a
build folder holding job.json plus the files it names (all build-relative):

    {
      "version": 1,
      "source": "source.md",         # prepared pandoc Markdown
      "headers": ["meta.tex", "preamble.tex", "cite.tex"],   # pandoc -H, in order
      "after": "after.tex",          # pandoc -A ("" = none)
      "metadataFile": "meta.json",   # pandoc --metadata-file (title/author/date)
      "bibliography": "refs.bib",    # "" when the note cites nothing
      "resourcePath": "/abs/note/folder",
      "parentDir": "/abs/parent",    # the export folder is created inside it
      "folderName": "Paper",
      "stem": "Paper",               # <stem>.pdf and <stem>.tex in the export folder
      "overwrite": false             # write into an existing export folder (the dialog warned)
    }

Subcommands:
    env <job.json>                     shell assignments (JOB_*) for render-pdf.sh
    deliver <job.json>                 create (or, with overwrite, reuse) the export folder
                                       and copy the deliverables
    latex-errors <doc.log> [doc.blg]   the useful lines of a failed LaTeX/biber run
    status-fail <stage> <message>      prints a failure status JSON line
"""

import json
import os
import re
import shlex
import shutil
import sys

FENCE = re.compile(r"^\s*(```|~~~)")
ATX_HEADING = re.compile(r"^(#{1,6})[ \t]+\S")


def status(obj):
    print(json.dumps(obj))


def fail(stage, message, code=1):
    status({"ok": False, "stage": stage, "message": message})
    sys.exit(code)


def load_job(path):
    with open(path, encoding="utf-8") as fh:
        job = json.load(fh)
    build = os.path.dirname(os.path.abspath(path))
    return job, build


def in_build(build, value):
    if not value:
        return ""
    return value if os.path.isabs(value) else os.path.join(build, value)


def heading_shift(text):
    """How far to shift headings so the shallowest one used becomes a LaTeX
    \\section: a note whose headings start at ## would otherwise number its
    sections 0.1, 0.2, …"""
    levels = []
    in_fence = False
    for line in text.split("\n"):
        if FENCE.match(line):
            in_fence = not in_fence
            continue
        m = None if in_fence else ATX_HEADING.match(line)
        if m:
            levels.append(len(m.group(1)))
    return 1 - min(levels) if levels else 0


def cmd_env(job_path):
    job, build = load_job(job_path)
    source = in_build(build, job.get("source") or "source.md")
    if not os.path.isfile(source):
        fail("job", "Source not found: %s" % source)
    headers = [in_build(build, h) for h in job.get("headers") or []]
    for h in headers:
        if not os.path.isfile(h):
            fail("job", "Header file not found: %s" % h)
    bibliography = in_build(build, job.get("bibliography", ""))
    if bibliography and not os.path.isfile(bibliography):
        fail("job", "Bibliography not found: %s" % bibliography)
    with open(source, encoding="utf-8") as fh:
        shift = heading_shift(fh.read())
    values = {
        "JOB_SOURCE": source,
        "JOB_HEADERS": "\n".join(headers),
        "JOB_AFTER": in_build(build, job.get("after", "")),
        "JOB_METADATA": in_build(build, job.get("metadataFile") or "meta.json"),
        "JOB_BIBLIOGRAPHY": bibliography,
        "JOB_HEADING_SHIFT": str(shift),
        "JOB_RESOURCE_PATH": job.get("resourcePath") or build,
    }
    for key, value in values.items():
        print("%s=%s" % (key, shlex.quote(value)))


def replace_file(src, dst):
    """Copy src over dst atomically: a reader never sees half a PDF."""
    tmp = dst + ".rd-partial"
    shutil.copyfile(src, tmp)
    os.replace(tmp, dst)


def cmd_deliver(job_path):
    """Put ONLY the deliverables in <parentDir>/<folderName>: <stem>.pdf,
    <stem>.tex, refs.bib (when cited) and media/.

    A new folder is made with a non-recursive mkdir. An existing folder is
    used only when the job says "overwrite" (the dialog showed the warning and
    Josh rendered anyway); then Render Doc's own files in it are replaced, a
    stale refs.bib or media/ from an earlier render is removed, and anything
    else in the folder is left alone. Without "overwrite", an existing folder
    fails with stage "collision" and nothing is written."""
    job, build = load_job(job_path)
    parent = job.get("parentDir") or ""
    name = job.get("folderName") or ""
    stem = job.get("stem") or name
    overwrite = bool(job.get("overwrite"))
    if not parent or not name:
        fail("deliver", "The job names no export folder.")
    pdf = os.path.join(build, "doc.pdf")
    if not os.path.isfile(pdf):
        fail("deliver", "LaTeX finished without producing a PDF.")
    if not os.path.isdir(parent):
        fail("deliver", "The parent folder does not exist: %s" % parent)
    target = os.path.join(parent, name)
    created = False
    try:
        os.mkdir(target)
        created = True
    except FileExistsError:
        if not overwrite:
            fail("collision", "%s already exists, so nothing was written. Render again to overwrite it." % target)
        if not os.path.isdir(target):
            fail("collision", "%s exists and is not a folder, so nothing was written." % target)
    except OSError as e:
        fail("deliver", "Could not create %s: %s" % (target, e))
    try:
        replace_file(pdf, os.path.join(target, stem + ".pdf"))
        replace_file(os.path.join(build, "doc.tex"), os.path.join(target, stem + ".tex"))
        bib = in_build(build, job.get("bibliography", ""))
        bib_out = os.path.join(target, os.path.basename(bib) if bib else "refs.bib")
        if bib:
            replace_file(bib, bib_out)
        elif os.path.isfile(bib_out):
            os.remove(bib_out)
        media_out = os.path.join(target, "media")
        if os.path.isdir(media_out):
            shutil.rmtree(media_out)
        media = os.path.join(build, "media")
        if os.path.isdir(media):
            shutil.copytree(media, media_out)
    except OSError as e:
        if created:
            shutil.rmtree(target, ignore_errors=True)
        fail("deliver", "Could not write into %s: %s" % (target, e))
    status({"ok": True, "output": target, "pdf": os.path.join(target, stem + ".pdf")})


def cmd_latex_errors(log_path, blg_path=None):
    picked = []
    try:
        with open(log_path, encoding="utf-8", errors="replace") as fh:
            lines = fh.read().split("\n")
    except OSError:
        lines = []
    for i, line in enumerate(lines):
        if line.startswith("!") or re.match(r"^\S+\.tex:\d+: ", line):
            picked.extend(lines[i:i + 4])
            picked.append("")
        if len(picked) > 30:
            break
    if blg_path and os.path.isfile(blg_path):
        with open(blg_path, encoding="utf-8", errors="replace") as fh:
            picked.extend(l for l in fh.read().split("\n") if l.startswith(("ERROR", "FATAL")))
    if not picked and not lines:
        print("LaTeX failed and left no log.")
        return
    print("\n".join(picked).strip() or "\n".join(lines[-20:]).strip())


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd, args = argv[1], argv[2:]
    if cmd == "env" and len(args) == 1:
        cmd_env(*args)
    elif cmd == "deliver" and len(args) == 1:
        cmd_deliver(*args)
    elif cmd == "latex-errors" and len(args) in (1, 2):
        cmd_latex_errors(*args)
    elif cmd == "status-fail" and len(args) == 2:
        status({"ok": False, "stage": args[0], "message": args[1]})
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
