import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function MessagesIndex() {
  const router = useRouter();
  useEffect(() => {
    fetch('/api/channels')
      .then(r => r.json())
      .then(data => {
        if (data.channels?.length > 0) {
          router.replace(`/messages/${data.channels[0].id}`);
        } else {
          router.replace('/friends/all');
        }
      })
      .catch(() => router.replace('/friends/all'));
  }, [router]);
  return null;
}
