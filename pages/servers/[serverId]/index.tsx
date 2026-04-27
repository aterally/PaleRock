import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function ServerRedirect() {
  const router = useRouter();
  const { serverId } = router.query;

  useEffect(() => {
    if (!serverId) return;
    fetch(`/api/servers/${serverId}`)
      .then(r => r.json())
      .then(data => {
        if (data.server?.channels?.length > 0) {
          router.replace(`/servers/${serverId}/${data.server.channels[0].id}`);
        } else {
          router.replace('/friends/all');
        }
      })
      .catch(() => router.replace('/friends/all'));
  }, [serverId, router]);

  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.15em', color: '#666' }}>
        LOADING
      </span>
    </div>
  );
}
