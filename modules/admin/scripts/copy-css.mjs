import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
copyFileSync(join(root, 'src', 'ui.css'), join(root, 'dist', 'ui.css'));
