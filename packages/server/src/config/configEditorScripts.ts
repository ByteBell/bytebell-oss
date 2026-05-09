export const CONFIG_EDITOR_SCRIPTS = (configJson: string, requiredKeys: string) => `
    const initialConfig = ${configJson};
    const requiredKeys = ${requiredKeys};

    const form = document.getElementById('config-form');
    const toast = document.getElementById('toast');

    // Initialize values
    Object.keys(initialConfig).forEach(key => {
        const input = document.getElementsByName(key)[0] || document.getElementById(key);
        if (input) {
            const val = key === 'concurrency' ? initialConfig[key].github : initialConfig[key];
            input.value = val !== undefined ? val : '';

            // Highlight if empty and required
            if (requiredKeys.includes(key) && !input.value) {
                input.classList.add('empty-required');
            }
        }
    });

    // Flatten nested concurrency for the form
    const githubInput = document.getElementsByName('concurrency.github')[0];
    if (githubInput && initialConfig.concurrency) {
        githubInput.value = initialConfig.concurrency.github;
    }

    form.onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = {};

        formData.forEach((value, key) => {
            // Special handling for nested keys
            if (key === 'concurrency.github') {
                data['concurrency.github'] = parseInt(value);
            } else if (key === 'server_port') {
                data[key] = parseInt(value);
            } else {
                data[key] = value;
            }
        });

        try {
            const res = await fetch('/config/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await res.json();
            if (result.ok) {
                showToast('Configuration saved successfully!', 'success');
                // Remove error highlights
                document.querySelectorAll('.empty-required').forEach(el => {
                    if (el.value) el.classList.remove('empty-required');
                });
            } else {
                showToast('Error: ' + result.error, 'error');
            }
        } catch (err) {
            showToast('Failed to connect to server', 'error');
        }
    };

    function showToast(msg, type) {
        toast.textContent = msg;
        toast.className = 'show toast-' + type;
        setTimeout(() => {
            toast.className = '';
        }, 3000);
    }
`;
