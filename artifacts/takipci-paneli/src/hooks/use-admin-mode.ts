/**
 * Returns true when the app was opened (or has ever been opened in this browser session)
 * with the `?admin` query parameter.
 *
 * Usage:  append ?admin to the URL once → admin features unlock for the whole session.
 * Close the tab → access reverts to normal.
 */
import { useEffect, useState } from 'react';

const SESSION_KEY = 'takipci_admin_mode';

export function useAdminMode(): boolean {
  const [isAdmin, setIsAdmin] = useState(() => {
    // Check sessionStorage first (persists across in-app navigation)
    if (sessionStorage.getItem(SESSION_KEY) === '1') return true;
    // Check current URL params
    const params = new URLSearchParams(window.location.search);
    return params.has('admin');
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('admin')) {
      sessionStorage.setItem(SESSION_KEY, '1');
      setIsAdmin(true);
    }
  }, []);

  return isAdmin;
}
