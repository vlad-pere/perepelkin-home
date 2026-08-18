import { Move } from '@perepelkin-home/module-move/ui';
import { api } from '../api';

export function MovePublicPage() {
  return (
    <div className="shell">
      <Move moduleId="move" api={api} canWrite={false} public />
    </div>
  );
}
