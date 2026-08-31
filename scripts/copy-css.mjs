import { copyFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
copyFileSync(join(root, 'src', 'ui.css'), join(root, 'dist', 'ui.css'));
