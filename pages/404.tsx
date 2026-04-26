import { useRouter } from 'next/router';

export default function NotFound() {
  const router = useRouter();
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      background: 'var(--bg)',
    }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 80,
        letterSpacing: '0.05em',
        color: 'var(--border-bright)',
        lineHeight: 1,
      }}>
        404
      </div>
      <p style={{ color: 'var(--text-3)', fontFamily: 'var(--font-display)', letterSpacing: '0.15em', fontSize: 12 }}>
        PAGE NOT FOUND
      </p>
      <button
        onClick={() => router.push('/')}
        style={{
          padding: '10px 24px',
          background: 'var(--text)',
          color: 'var(--bg)',
          border: 'none',
          borderRadius: 'var(--radius)',
          cursor: 'pointer',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: '0.1em',
        }}
      >
        GO HOME
      </button>
    </div>
  );
}
