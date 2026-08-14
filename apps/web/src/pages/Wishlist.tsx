import { Wishlist } from '@perepelkin-home/module-wishlist/ui';
import { api } from '../api';

export function WishlistPublicPage() {
  return (
    <div className="shell">
      <Wishlist moduleId="wishlist" api={api} canWrite={false} public />
    </div>
  );
}
