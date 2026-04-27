import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function FriendsIndex() {
  const router = useRouter();
  useEffect(() => { router.replace('/friends/all'); }, [router]);
  return null;
}
