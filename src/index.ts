import { Hono } from 'hono'

type Bindings = {
  QR_SESSIONS: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QR Sync - Pair Your Device</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        :root {
            /* Material 3 Light Theme Colors (Tonal Palette) */
            --md-sys-color-primary: #005ac1;
            --md-sys-color-on-primary: #ffffff;
            --md-sys-color-primary-container: #d8e2ff;
            --md-sys-color-on-primary-container: #001a41;
            --md-sys-color-secondary-container: #e1e2ec;
            --md-sys-color-on-secondary-container: #191c21;
            --md-sys-color-surface: #fdfcff;
            --md-sys-color-on-surface: #1a1c1e;
            --md-sys-color-outline: #74777f;
            --md-sys-color-surface-variant: #e1e2ec;
        }

        body {
            margin: 0;
            padding: 0;
            font-family: 'Outfit', sans-serif;
            background-color: var(--md-sys-color-surface);
            color: var(--md-sys-color-on-surface);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }

        .container {
            text-align: center;
            background: var(--md-sys-color-surface);
            padding: 2.5rem;
            border-radius: 2rem; /* M3 Extra Large Shape */
            width: 100%;
            max-width: 360px;
        }

        h1 {
            font-weight: 500;
            font-size: 1.5rem;
            margin-bottom: 0.5rem;
            color: var(--md-sys-color-on-surface);
        }

        p {
            color: var(--md-sys-color-outline);
            font-size: 0.95rem;
            margin-bottom: 2rem;
            line-height: 1.5;
        }

        #qrcode-container {
            background: var(--md-sys-color-secondary-container);
            padding: 1.5rem;
            border-radius: 1.5rem;
            display: inline-block;
            margin-bottom: 1.5rem;
        }

        #qrcode {
            border-radius: 0.5rem;
            overflow: hidden;
            background: white;
            padding: 0.5rem;
        }

        #session-display {
            background: var(--md-sys-color-primary-container);
            color: var(--md-sys-color-on-primary-container);
            padding: 0.75rem 2rem;
            border-radius: 1rem;
            font-weight: 600;
            font-size: 1.75rem;
            letter-spacing: 6px;
            display: inline-block;
            margin-top: 0.5rem;
        }

        .status {
            margin-top: 2.5rem;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            font-size: 0.85rem;
            color: var(--md-sys-color-outline);
        }

        .spinner {
            width: 18px;
            height: 18px;
            border: 2.5px solid var(--md-sys-color-primary);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Pair Device</h1>
        <p>Scan the code or enter the ID on your mobile app to continue.</p>
        
        <div id="qrcode-container">
            <div id="qrcode"></div>
        </div>

        <div>
            <div id="session-display">...</div>
        </div>

        <div class="status">
            <div class="spinner"></div>
            <span id="status-text">Ready to pair</span>
        </div>
    </div>

    <script>
        const qrContainer = document.getElementById('qrcode');
        const sessionDisplay = document.getElementById('session-display');
        const statusText = document.getElementById('status-text');
        let sessionId = null;

        async function init() {
            try {
                const res = await fetch('/api/session');
                const data = await res.json();
                sessionId = data.id;
                sessionDisplay.innerText = sessionId;

                new QRCode(qrContainer, {
                    text: sessionId,
                    width: 256,
                    height: 256,
                    colorDark : "#0f172a",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                });

                poll();
            } catch (err) {
                statusText.innerText = 'Failed to initialize session';
            }
        }

        async function poll() {
            if (!sessionId) return;

            try {
                // Long polling: This request might hang for up to 20s
                const res = await fetch(\`/api/poll/\${sessionId}\`);
                const data = await res.json();

                if (data.url) {
                    statusText.innerText = 'Connecting...';
                    setTimeout(() => {
                        window.location.href = data.url;
                    }, 500);
                } else {
                    // Re-poll immediately after a long-poll timeout or empty result
                    poll();
                }
            } catch (err) {
                console.error('Polling error:', err);
                // On error, wait a bit before retrying to avoid spamming
                setTimeout(poll, 5000);
            }
        }

        init();
    </script>
</body>
</html>
  `)
})

app.get('/api/session', async (c) => {
  let id = ''
  let isUnique = false
  let attempts = 0

  // Generate a unique 6-digit numeric ID
  while (!isUnique && attempts < 10) {
    id = Math.floor(Math.random() * 1000000).toString().padStart(6, '0')
    const existing = await c.env.QR_SESSIONS.get(id)
    if (!existing) {
      isUnique = true
    }
    attempts++
  }
  
  await c.env.QR_SESSIONS.put(id, JSON.stringify({ status: 'pending' }), { expirationTtl: 600 })
  return c.json({ id })
})

app.get('/api/poll/:id', async (c) => {
  const id = c.req.param('id')
  const startTime = Date.now()
  const timeout = 20000 // Hold connection for 20 seconds

  while (Date.now() - startTime < timeout) {
    const data = await c.env.QR_SESSIONS.get(id)
    if (data) {
      const session = JSON.parse(data)
      if (session.status === 'completed') {
        return c.json(session)
      }
    }
    // Wait 2 seconds before checking KV again
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  
  return c.json({ status: 'pending' })
})

app.post('/api/push/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  
  const data = await c.env.QR_SESSIONS.get(id)
  if (!data) return c.json({ error: 'Session not found' }, 404)

  const session = JSON.parse(data)
  session.url = body.url
  session.status = 'completed'

  await c.env.QR_SESSIONS.put(id, JSON.stringify(session), { expirationTtl: 600 })
  return c.json({ success: true })
})

export default app
