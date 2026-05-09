export const CONFIG_EDITOR_STYLES = `
    :root {
        --bg: #09090b;
        --card: rgba(24, 24, 27, 0.7);
        --border: rgba(63, 63, 70, 0.5);
        --accent: #3b82f6;
        --accent-glow: rgba(59, 130, 246, 0.5);
        --text: #f4f4f5;
        --text-dim: #a1a1aa;
        --error: #ef4444;
        --success: #10b981;
        --warning: #f59e0b;
    }

    * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }

    body {
        background-color: var(--bg);
        color: var(--text);
        font-family: 'Outfit', sans-serif;
        line-height: 1.5;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        overflow-x: hidden;
        background-image:
            radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.05) 0%, transparent 40%),
            radial-gradient(circle at 80% 80%, rgba(147, 51, 234, 0.05) 0%, transparent 40%);
    }

    .container {
        width: 100%;
        max-width: 800px;
        padding: 4rem 2rem;
        animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }

    header {
        text-align: center;
        margin-bottom: 3rem;
    }

    h1 {
        font-size: 3.5rem;
        font-weight: 800;
        letter-spacing: -0.05em;
        margin-bottom: 0.5rem;
        background: linear-gradient(135deg, #fff 0%, #a1a1aa 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .subtitle {
        color: var(--text-dim);
        font-size: 1.1rem;
    }

    .config-card {
        background: var(--card);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 2.5rem;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }

    .section {
        margin-bottom: 2.5rem;
    }

    .section-title {
        font-size: 0.9rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--accent);
        margin-bottom: 1.5rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .section-title::after {
        content: '';
        height: 1px;
        flex-grow: 1;
        background: var(--border);
    }

    .field {
        margin-bottom: 1.5rem;
        position: relative;
    }

    .label-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }

    label {
        font-size: 0.95rem;
        font-weight: 500;
        color: var(--text);
    }

    .badge {
        font-size: 0.7rem;
        padding: 0.1rem 0.5rem;
        border-radius: 9999px;
        text-transform: uppercase;
        font-weight: 700;
    }

    .badge-required {
        background: rgba(239, 68, 68, 0.1);
        color: var(--error);
        border: 1px solid rgba(239, 68, 68, 0.2);
    }

    .input-wrapper {
        position: relative;
        transition: transform 0.2s ease;
    }

    input {
        width: 100%;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 0.8rem 1rem;
        color: var(--text);
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.9rem;
        transition: all 0.3s ease;
    }

    input:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 4px var(--accent-glow);
        background: rgba(0, 0, 0, 0.5);
    }

    input.empty-required {
        border-color: var(--error);
        box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.1);
    }

    .hint {
        font-size: 0.8rem;
        color: var(--text-dim);
        margin-top: 0.4rem;
    }

    .actions {
        margin-top: 3rem;
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
    }

    button {
        padding: 0.8rem 2rem;
        border-radius: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        font-family: inherit;
    }

    .btn-primary {
        background: var(--accent);
        color: white;
        border: none;
        box-shadow: 0 10px 15px -3px var(--accent-glow);
    }

    .btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 20px 25px -5px var(--accent-glow);
        filter: brightness(1.1);
    }

    .btn-primary:active {
        transform: translateY(0);
    }

    .btn-secondary {
        background: transparent;
        color: var(--text);
        border: 1px solid var(--border);
    }

    .btn-secondary:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: var(--text-dim);
    }

    #toast {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        padding: 1rem 2rem;
        border-radius: 12px;
        background: var(--card);
        border: 1px solid var(--border);
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
        transform: translateY(100px);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        z-index: 1000;
    }

    #toast.show {
        transform: translateY(0);
        opacity: 1;
    }

    .toast-success { border-color: var(--success); }
    .toast-error { border-color: var(--error); }

    /* Custom Scrollbar */
    ::-webkit-scrollbar { width: 10px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 5px; }
    ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
`;
