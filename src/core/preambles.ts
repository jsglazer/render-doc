// The built-in Dev and Submit preambles: the starting text of the two
// preamble boxes on the settings page, and what "Reset to default" restores.
// Pure — no 'obsidian'.
//
// Both began as Josh's LatexPre.tex. Render Doc's meta.tex (included BEFORE
// the preamble, see src/core/latex.ts) defines the per-note macros they use:
//   \DocTitle  \DocShortTitle  \DocAuthor  \DocClass  \DocProf  \DocDate
// Each is \providecommand'ed here too, so the delivered .tex and a preamble
// used on its own still compile.
//
// \maketitle is redefined as the cover page, modelled on an APA student title
// page without its running head, "Full Title" line or due-date label: title,
// author, then class, professor and date at the foot, each line skipped when
// empty. The cover has no header or footer and is not counted, so the first
// page of text is page 1 of N.

const COMMON = String.raw`\usepackage[top=.75in, bottom=.75in, left=.75in, right=.75in, includehead, includefoot, marginparwidth=.75in, marginparsep=.125in]{geometry}
\setlength{\parskip}{.15in}
\usepackage{enumitem}
\setlist{itemsep=2pt, parsep=0pt, topsep=4pt}
\usepackage{hyperref}

\RequirePackage{datetime}
\settimeformat{ampmtime}
\newdateformat{dashdate}{\THEYEAR-\twodigit{\THEMONTH}-\twodigit{\THEDAY}}
\newtimeformat{dottime}{\twodigit{\THEHOUR}:\twodigit{\THEMINUTE}:\twodigit{\THESECOND}}

\RequirePackage{lastpage}    %% Required for pages of page number
\RequirePackage{fancyhdr}   %must come after geometry
\RequirePackage{etoolbox}
\pagestyle{fancy}
\renewcommand{\sectionmark}[1]{\markright{Sec.\thesection:\ #1}{}}

% Per-note values, set by Render Doc's meta.tex from the note's frontmatter
% (title, titleshort, author, class, prof, date). Empty when absent; the
% header title falls back to \jobname, the short title to the title.
\providecommand{\DocTitle}{}
\providecommand{\DocShortTitle}{}
\providecommand{\DocAuthor}{}
\providecommand{\DocClass}{}
\providecommand{\DocProf}{}
\providecommand{\DocDate}{}
\newcommand{\HeaderTitle}{\ifdefempty{\DocTitle}{\jobname}{\DocTitle}}
\newcommand{\HeaderShortTitle}{\ifdefempty{\DocShortTitle}{\HeaderTitle}{\DocShortTitle}}

% Cover page (pandoc calls \maketitle at the start of the document).
\newcommand{\CoverLine}[1]{\ifdefempty{#1}{}{#1\par\medskip}}
\renewcommand{\maketitle}{%
  \pagenumbering{Alph}%
  \thispagestyle{empty}%
  \begin{center}
    \vspace*{.25\textheight}
    {\LARGE \HeaderTitle\par}
    \vspace{.12\textheight}
    {\large \DocAuthor\par}
    \vfill
    {\large \CoverLine{\DocClass}\CoverLine{\DocProf}\CoverLine{\DocDate}}
  \end{center}
  \clearpage
  \pagenumbering{arabic}%
}
`;

const TABLE_LINES = String.raw`
% Light grey rule between table rows. Just the color setup lives here — the
% actual \hline-per-row is inserted into the generated .tex body by the
% renderer's rowlines.py, since longtable's internal row-end machinery
% actively resists doing this via a preamble hook.
\usepackage{colortbl}
\definecolor{rowline}{gray}{0.75}
% Extra row height so the rules clear accents (hats, bars) on symbols.
\renewcommand{\arraystretch}{1.3}
`;

const DEV_HEADER = String.raw`
% Dev: title and author in the header; page x of y and a date/time stamp in the footer.
\fancyhead{} % clear all header fields
\fancyhead[L]{\small{\textbf{\HeaderTitle}}}
\fancyhead[R]{\small{\DocAuthor}}
\fancyfoot{}
\fancyfoot[L]{\scriptsize{\thepage\ of \pageref{LastPage}}}
\fancyfoot[R]{\scriptsize{\dashdate{\today} at \dottime}}
\renewcommand{\headrulewidth}{0.4pt}
\renewcommand{\footrulewidth}{0.4pt}
`;

const SUBMIT_HEADER = String.raw`
% Submit: short title (bold) and author in the header; page x of y centred; no date/time stamp.
\fancyhead{} % clear all header fields
\fancyhead[L]{\small{\textbf{\HeaderShortTitle}}}
\fancyhead[R]{\small{\DocAuthor}}
\fancyfoot{}
\fancyfoot[C]{\scriptsize{\thepage\ of \pageref{LastPage}}}
\renewcommand{\headrulewidth}{0.4pt}
\renewcommand{\footrulewidth}{0.4pt}
`;

export const DEFAULT_DEV_PREAMBLE = `${COMMON}${DEV_HEADER}${TABLE_LINES}`;
export const DEFAULT_SUBMIT_PREAMBLE = `${COMMON}${SUBMIT_HEADER}${TABLE_LINES}`;
