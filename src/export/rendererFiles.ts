// Every renderer file, as bundled text. Keys are paths relative to the
// installed renderer folder.

import jobPy from '../../renderer/job.py';
import libSh from '../../renderer/lib.sh';
import listsPy from '../../renderer/lists.py';
import renderSh from '../../renderer/render-pdf.sh';
import rowlinesPy from '../../renderer/rowlines.py';
import tablesPy from '../../renderer/tables.py';

export const RENDERER_FILES: Readonly<Record<string, string>> = {
	'render-pdf.sh': renderSh,
	'lib.sh': libSh,
	'job.py': jobPy,
	'tables.py': tablesPy,
	'lists.py': listsPy,
	'rowlines.py': rowlinesPy,
};
